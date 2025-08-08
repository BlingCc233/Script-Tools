package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/schollz/progressbar/v3" 
	"golang.org/x/net/proxy"
)

const (
	outputFileName    = "output.txt"
	defaultMaxWorkers = 10
	httpClientTimeout = 10 * time.Second
	socksDialTimeout  = 10 * time.Second
	socksTestURL = "http://clients3.google.com/generate_204"
)

type ConfigResponse struct {
	AllowLan  bool   `json:"allow-lan"`
	SocksPort int    `json:"socks-port"`
	MixedPort int    `json:"mixed-port"`
	Port      int    `json:"port"`
}

type PatchPayload struct {
	AllowLan bool `json:"allow-lan"`
}

type Task struct {
	IP   string
	Port string
	City string
}

var (
	nameCounts = make(map[string]int)
	nameMutex  = &sync.Mutex{}
	outputFile *os.File
	outputLock = &sync.Mutex{}
	// 这个httpClient用于直接连接，不通过代理
	httpClient = &http.Client{
		Timeout: httpClientTimeout,
	}
)

func getUniqueName(baseName string) string {
	nameMutex.Lock()
	defer nameMutex.Unlock()
	count, exists := nameCounts[baseName]
	if !exists {
		nameCounts[baseName] = 0
		return baseName
	}
	count++
	nameCounts[baseName] = count
	return fmt.Sprintf("%s%d", baseName, count)
}

// processRow 现在接收一个 progressbar.ProgressBar 指针
func processRow(task Task, wg *sync.WaitGroup, bar *progressbar.ProgressBar) {
	defer func() {
		if bar != nil {
			bar.Add(1)
		}
		wg.Done()
	}()

	log.Printf("处理: IP=%s, Port=%s, City=%s\n", task.IP, task.Port, task.City)

	configsURL := fmt.Sprintf("http://%s:%s/configs", task.IP, task.Port)
	req, err := http.NewRequest("GET", configsURL, nil)
	if err != nil {
		log.Printf("错误: 无法创建GET请求 %s: %v\n", configsURL, err)
		return
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		log.Printf("错误: GET %s 失败: %v\n", configsURL, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("错误: GET %s 返回状态码 %d, Body: %s\n", configsURL, resp.StatusCode, string(bodyBytes))
		return
	}

	var configData ConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&configData); err != nil {
		log.Printf("错误: 解析 %s 的JSON响应失败: %v\n", configsURL, err)
		return
	}

	log.Printf("信息: %s:%s - 初始 allow-lan: %v, socks-port: %d, mixed-port: %d\n", task.IP, task.Port, configData.AllowLan, configData.SocksPort, configData.MixedPort)

	if !configData.AllowLan {
		log.Printf("信息: %s:%s - allow-lan 为 false, 尝试 PATCH...\n", task.IP, task.Port)
		patchPayload := PatchPayload{AllowLan: true}
		payloadBytes, err := json.Marshal(patchPayload)
		if err != nil {
			log.Printf("错误: 序列化PATCH payload失败 %s: %v\n", configsURL, err)
			return
		}

		patchReq, err := http.NewRequest("PATCH", configsURL, bytes.NewBuffer(payloadBytes))
		if err != nil {
			log.Printf("错误: 无法创建PATCH请求 %s: %v\n", configsURL, err)
			return
		}
		patchReq.Header.Set("Content-Type", "application/json")

		patchResp, err := httpClient.Do(patchReq)
		if err != nil {
			log.Printf("错误: PATCH %s 失败: %v\n", configsURL, err)
			return
		}
		defer patchResp.Body.Close()

		if patchResp.StatusCode != http.StatusOK && patchResp.StatusCode != http.StatusNoContent && patchResp.StatusCode != http.StatusAccepted {
			bodyBytes, _ := io.ReadAll(patchResp.Body)
			log.Printf("错误: PATCH %s 返回状态码 %d, Body: %s\n", configsURL, patchResp.StatusCode, string(bodyBytes))
			return
		}
		log.Printf("信息: %s:%s - PATCH 成功, allow-lan 设置为 true\n", task.IP, task.Port)
		configData.AllowLan = true
	}

	socks5Port := configData.SocksPort
	if socks5Port == 0 {
		socks5Port = configData.MixedPort
	}

	if socks5Port == 0 {
		log.Printf("错误: %s:%s - 未找到有效的SOCKS端口 (socks-port: %d, mixed-port: %d)\n", task.IP, task.Port, configData.SocksPort, configData.MixedPort)
		return
	}

	log.Printf("信息: %s:%s - 使用SOCKS端口: %d\n", task.IP, task.Port, socks5Port)

	socksAddr := fmt.Sprintf("%s:%d", task.IP, socks5Port)
	dialer, err := proxy.SOCKS5("tcp", socksAddr, nil, &net.Dialer{
		Timeout:   socksDialTimeout,
		KeepAlive: 0,
	})
	if err != nil {
		log.Printf("错误: %s:%s - 创建SOCKS5拨号器失败 (%s): %v\n", task.IP, task.Port, socksAddr, err)
		return
	}

	// --- [开始] 修改SOCKS连通性测试 ---
	// 创建一个使用SOCKS5代理的http.Transport
	// golang.org/x/net/proxy.Dialer 实现了 DialContext 方法
	proxyTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		},
	}

	// 创建一个专门用于通过代理测试的http.Client
	// 注意：不能复用全局的httpClient，因为它需要直连API
	proxyClient := &http.Client{
		Transport: proxyTransport,
		Timeout:   httpClientTimeout, // 复用超时设置
	}

	log.Printf("信息: %s:%s - 通过SOCKS代理测试URL: %s\n", task.IP, task.Port, socksTestURL)
	getResp, err := proxyClient.Get(socksTestURL)
	if err != nil {
		log.Printf("错误: %s:%s - 通过SOCKS代理请求 %s 失败: %v\n", task.IP, task.Port, socksTestURL, err)
		return
	}
	defer getResp.Body.Close()

	// Google的generate_204端点在成功时返回204 No Content状态码
	if getResp.StatusCode != http.StatusNoContent {
		log.Printf("错误: %s:%s - SOCKS代理测试返回非预期的状态码 %d (期望 %d) from %s\n", task.IP, task.Port, getResp.StatusCode, http.StatusNoContent, socksTestURL)
		return
	}

	log.Printf("成功: %s:%s - SOCKS5代理连通性测试成功 (URL: %s, Status: %s)\n", task.IP, task.Port, socksTestURL, getResp.Status)
	// --- [结束] 修改SOCKS连通性测试 ---

	uniqueCityName := getUniqueName(task.City)
	encodedCityName := url.PathEscape(uniqueCityName)
	outputLine := fmt.Sprintf("socks://Og%%3D%%3D@%s:%d#%s\n", task.IP, socks5Port, encodedCityName)

	outputLock.Lock()
	defer outputLock.Unlock()
	if _, err := outputFile.WriteString(outputLine); err != nil {
		log.Printf("错误: 写入output文件失败: %v\n", err)
	} else {
		log.Printf("写入: %s", outputLine)
	}
}

// countCsvDataRows 计算CSV文件中的数据行数（不包括表头）
func countCsvDataRows(filePath string, header []string, ipIdx, portIdx, cityIdx int) (int, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, fmt.Errorf("无法打开CSV文件进行计数 %s: %w", filePath, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	_, err = reader.Read() // 读取并跳过表头
	if err != nil {
		if err == io.EOF {
			return 0, nil // 文件为空或只有表头
		}
		return 0, fmt.Errorf("读取CSV表头失败（计数时）: %w", err)
	}

	rowCount := 0
	lineNumber := 1 // 从数据行开始计数
	for {
		lineNumber++
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("警告: 计数CSV行时，第 %d 行解析错误: %v。此行将不计入进度条总数。\n", lineNumber, err)
			continue
		}

		if len(record) <= ipIdx || len(record) <= portIdx || len(record) <= cityIdx {
			continue
		}

		ip := strings.TrimSpace(record[ipIdx])
		port := strings.TrimSpace(record[portIdx])
		city := strings.TrimSpace(record[cityIdx])

		if ip == "" || port == "" || city == "" {
			continue
		}
		rowCount++
	}
	return rowCount, nil
}

// getCsvHeaderAndIndices 读取CSV头部并返回列名到索引的映射
func getCsvHeaderAndIndices(reader *csv.Reader) ([]string, int, int, int, error) {
	header, err := reader.Read() // 读取表头
	if err != nil {
		if err == io.EOF {
			return nil, -1, -1, -1, fmt.Errorf("CSV文件为空")
		}
		return nil, -1, -1, -1, fmt.Errorf("读取CSV表头失败: %w", err)
	}

	ipIdx, portIdx, cityIdx := -1, -1, -1
	for i, colName := range header {
		trimmedName := strings.TrimSpace(strings.ToLower(colName))
		switch trimmedName {
		case "ip":
			ipIdx = i
		case "port":
			portIdx = i
		case "city":
			cityIdx = i
		}
	}

	if ipIdx == -1 || portIdx == -1 || cityIdx == -1 {
		return header, -1, -1, -1, fmt.Errorf("CSV文件中必须包含 'ip', 'port', 和 'city' 列. 找到: ipIdx=%d, portIdx=%d, cityIdx=%d", ipIdx, portIdx, cityIdx)
	}
	return header, ipIdx, portIdx, cityIdx, nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Printf("用法: %s <csv_file_path> [max_workers]\n", os.Args[0])
		os.Exit(1)
	}
	csvFilePath := os.Args[1]

	maxWorkers := defaultMaxWorkers
	if len(os.Args) > 2 {
		mw, err := strconv.Atoi(os.Args[2])
		if err == nil && mw > 0 {
			maxWorkers = mw
		} else {
			log.Printf("警告: 无效的并发数 '%s', 使用默认值 %d\n", os.Args[2], defaultMaxWorkers)
		}
	}
	log.Printf("使用最大并发数: %d\n", maxWorkers)

	tempCsvFileForHeader, err := os.Open(csvFilePath)
	if err != nil {
		log.Fatalf("错误: 无法打开CSV文件 %s 以读取表头: %v\n", csvFilePath, err)
	}
	tempReaderForHeader := csv.NewReader(tempCsvFileForHeader)
	headerForCount, ipIdxForCount, portIdxForCount, cityIdxForCount, err := getCsvHeaderAndIndices(tempReaderForHeader)
	tempCsvFileForHeader.Close()
	if err != nil {
		log.Fatalf("错误: 解析CSV表头失败（用于计数）: %v\n", err)
	}

	totalTasks, err := countCsvDataRows(csvFilePath, headerForCount, ipIdxForCount, portIdxForCount, cityIdxForCount)
	if err != nil {
		log.Fatalf("错误: 计算CSV行数失败: %v\n", err)
	}
	if totalTasks == 0 {
		log.Println("信息: CSV文件中没有可处理的数据行。")
		return
	}
	log.Printf("信息: CSV文件 '%s' 中找到 %d 个可处理的数据行。\n", csvFilePath, totalTasks)

	bar := progressbar.NewOptions(totalTasks,
		progressbar.OptionSetDescription("处理CSV行..."),
		progressbar.OptionSetWriter(os.Stderr),
		progressbar.OptionShowCount(),
		progressbar.OptionShowIts(),
		progressbar.OptionSetElapsedTime(true),
		progressbar.OptionSetPredictTime(true),
		progressbar.OptionClearOnFinish(),
		progressbar.OptionEnableColorCodes(true),
		progressbar.OptionSetTheme(progressbar.Theme{
			Saucer:        "=",
			SaucerHead:    ">",
			SaucerPadding: " ",
			BarStart:      "[",
			BarEnd:        "]",
		}),
	)

	csvFile, err := os.Open(csvFilePath)
	if err != nil {
		log.Fatalf("错误: 无法打开CSV文件 %s: %v\n", csvFilePath, err)
	}
	defer csvFile.Close()

	outputFile, err = os.OpenFile(outputFileName, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatalf("错误: 无法打开或创建输出文件 %s: %v\n", outputFileName, err)
	}
	defer outputFile.Close()

	reader := csv.NewReader(csvFile)
	_, ipIdx, portIdx, cityIdx, err := getCsvHeaderAndIndices(reader)
	if err != nil {
		log.Fatalf("错误: %v\n", err)
	}

	var wg sync.WaitGroup
	taskQueue := make(chan Task, maxWorkers)

	for i := 0; i < maxWorkers; i++ {
		go func() {
			for task := range taskQueue {
				processRow(task, &wg, bar)
			}
		}()
	}

	lineNumber := 1
	for {
		lineNumber++
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("错误: 读取CSV文件第 %d 行失败: %v, 跳过\n", lineNumber, err)
			continue
		}

		if len(record) <= ipIdx || len(record) <= portIdx || len(record) <= cityIdx {
			log.Printf("错误: 第 %d 行数据列数不足, 跳过 (IP列索引: %d, Port列索引: %d, City列索引: %d, 记录列数: %d)\n", lineNumber, ipIdx, portIdx, cityIdx, len(record))
			continue
		}

		ip := strings.TrimSpace(record[ipIdx])
		portStr := strings.TrimSpace(record[portIdx])
		city := strings.TrimSpace(record[cityIdx])

		if ip == "" || portStr == "" || city == "" {
			log.Printf("警告: 第 %d 行数据不完整 (IP: '%s', Port: '%s', City: '%s'), 跳过\n", lineNumber, ip, portStr, city)
			continue
		}

		wg.Add(1)
		taskQueue <- Task{IP: ip, Port: portStr, City: city}
	}

	close(taskQueue)
	wg.Wait()

	log.Println("所有任务处理完毕.")
}
