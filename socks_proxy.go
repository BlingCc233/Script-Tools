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
	socksTestURL      = "http://clients3.google.com/generate_204"
	ipInfoURL         = "http://ipwho.is"
	ipApiFallbackURL  = "https://api.ipapi.is"
	// 可选：用于访问 /configs 的 Bearer Token
	bearerToken = "123456"
)

// IP信息响应结构体 (ipwho.is)
type IPInfoResponse struct {
	Success     bool   `json:"success"`
	Country     string `json:"country"`
	CountryCode string `json:"country_code"`
	City        string `json:"city"`
	Region      string `json:"region"`
}

// IP API 响应结构体 (api.ipapi.is)
type IPAPIResponse struct {
	Location struct {
		Country string `json:"country"`
	} `json:"location"`
}

// 自定义 Transport：为每个请求添加 Authorization 头
type headerAuthTransport struct {
	Transport http.RoundTripper
}

func (t *headerAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	reqClone := req.Clone(req.Context())
	if bearerToken != "" {
		reqClone.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	transport := t.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	return transport.RoundTrip(reqClone)
}

type ConfigResponse struct {
	AllowLan  bool `json:"allow-lan"`
	SocksPort int  `json:"socks-port"`
	MixedPort int  `json:"mixed-port"`
	Port      int  `json:"port"`
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

	// 直接连接使用的 httpClient（访问 /configs）
	httpClient = &http.Client{
		Timeout: httpClientTimeout,
		Transport: &headerAuthTransport{
			Transport: http.DefaultTransport,
		},
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

// 通过SOCKS代理获取IP信息，带有备用API支持
func getIPInfoViaProxy(dialer proxy.Dialer, fallbackName string) string {
	proxyTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		},
	}

	client := &http.Client{
		Transport: proxyTransport,
		Timeout:   httpClientTimeout,
	}

	// 尝试第一个API: ipwho.is
	log.Printf("信息: 通过SOCKS代理获取IP信息: %s\n", ipInfoURL)
	resp, err := client.Get(ipInfoURL)
	if err != nil {
		log.Printf("警告: 通过SOCKS代理获取IP信息失败 (%s): %v，尝试备用API\n", ipInfoURL, err)
	} else {
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			var ipInfo IPInfoResponse
			if err := json.NewDecoder(resp.Body).Decode(&ipInfo); err == nil {
				if ipInfo.Success && ipInfo.Country != "" {
					log.Printf("成功: 从ipwho.is获取到真实国家信息: %s (原名称: %s)\n", ipInfo.Country, fallbackName)
					return ipInfo.Country
				}
			}
		}
		log.Printf("警告: ipwho.is返回状态码 %d 或解析失败，尝试备用API\n", resp.StatusCode)
	}

	// 尝试备用API: api.ipapi.is
	log.Printf("信息: 尝试备用API获取IP信息: %s\n", ipApiFallbackURL)
	resp2, err := client.Get(ipApiFallbackURL)
	if err != nil {
		log.Printf("警告: 通过SOCKS代理获取备用IP信息失败 (%s): %v，使用回退名称: %s\n", ipApiFallbackURL, err, fallbackName)
		return fallbackName
	}
	defer resp2.Body.Close()

	if resp2.StatusCode != http.StatusOK {
		log.Printf("警告: 备用IP信息服务返回状态码 %d，使用回退名称: %s\n", resp2.StatusCode, fallbackName)
		return fallbackName
	}

	var ipAPIInfo IPAPIResponse
	if err := json.NewDecoder(resp2.Body).Decode(&ipAPIInfo); err != nil {
		log.Printf("警告: 解析备用IP信息JSON失败: %v，使用回退名称: %s\n", err, fallbackName)
		return fallbackName
	}

	if ipAPIInfo.Location.Country == "" {
		log.Printf("警告: 备用API返回的国家信息为空，使用回退名称: %s\n", fallbackName)
		return fallbackName
	}

	log.Printf("成功: 从api.ipapi.is获取到真实国家信息: %s (原名称: %s)\n", ipAPIInfo.Location.Country, fallbackName)
	return ipAPIInfo.Location.Country
}

func writeOutput(ip string, port int, countryName string) {
	uniqueCountryName := getUniqueName(countryName)
	encodedCountryName := url.PathEscape(uniqueCountryName)
	outputLine := fmt.Sprintf("socks://Og%%3D%%3D@%s:%d#%s\n", ip, port, encodedCountryName)

	outputLock.Lock()
	defer outputLock.Unlock()
	if _, err := outputFile.WriteString(outputLine); err != nil {
		log.Printf("错误: 写入output文件失败: %v\n", err)
	} else {
		log.Printf("写入: %s", outputLine)
	}
}

func testSocks(ip string, port int, withAuthHeader bool) bool {
	socksAddr := fmt.Sprintf("%s:%d", ip, port)

	dialer, err := proxy.SOCKS5("tcp", socksAddr, nil, &net.Dialer{
		Timeout:   socksDialTimeout,
		KeepAlive: 0,
	})
	if err != nil {
		log.Printf("错误: 创建SOCKS5拨号器失败 (%s): %v\n", socksAddr, err)
		return false
	}

	proxyTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		},
	}

	var rt http.RoundTripper = proxyTransport
	if withAuthHeader {
		// 仅当需要为代理路径添加 Authorization 头时包一层
		rt = &headerAuthTransport{Transport: proxyTransport}
	}

	client := &http.Client{
		Transport: rt,
		Timeout:   httpClientTimeout,
	}

	log.Printf("信息: 通过SOCKS代理测试 %s -> %s\n", socksAddr, socksTestURL)
	resp, err := client.Get(socksTestURL)
	if err != nil {
		log.Printf("错误: SOCKS代理 %s 请求失败: %v\n", socksAddr, err)
		return false
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		log.Printf("错误: SOCKS代理 %s 返回状态码 %d (期望 %d)\n", socksAddr, resp.StatusCode, http.StatusNoContent)
		return false
	}

	log.Printf("成功: SOCKS代理 %s 连通性测试通过\n", socksAddr)
	return true
}

func fallbackTestDefaultPorts(task Task) {
	log.Printf("回退: 尝试直接测试默认端口 7890/7891/7893 的SOCKS连通性 (IP=%s, City=%s)\n", task.IP, task.City)
	for _, p := range []int{7890, 7891, 7893} {
		if testSocks(task.IP, p, false) {
			// 为回退测试创建SOCKS拨号器，用于获取IP信息
			socksAddr := fmt.Sprintf("%s:%d", task.IP, p)
			dialer, err := proxy.SOCKS5("tcp", socksAddr, nil, &net.Dialer{
				Timeout:   socksDialTimeout,
				KeepAlive: 0,
			})
			if err != nil {
				log.Printf("警告: 回退测试中创建SOCKS5拨号器失败，使用原始城市名: %v\n", err)
				writeOutput(task.IP, p, task.City)
				continue
			}

			// 获取真实国家信息
			realCountry := getIPInfoViaProxy(dialer, task.City)
			writeOutput(task.IP, p, realCountry)
		}
	}
}

func processRow(task Task, wg *sync.WaitGroup, bar *progressbar.ProgressBar) {
	defer func() {
		if bar != nil {
			_ = bar.Add(1)
		}
		wg.Done()
	}()

	log.Printf("处理: IP=%s, Port=%s, City=%s\n", task.IP, task.Port, task.City)

	// 标记是否"到达了通过SOCKS代理发起测试请求"的步骤
	// 只有到达该步骤，才视为原流程已开始 SOCKS 测试，不再回退。
	enteredSocksTestStep := false

	// 1) 原本流程：读取 /configs
	configsURL := fmt.Sprintf("http://%s:%s/configs", task.IP, task.Port)
	resp, err := httpClient.Get(configsURL)
	if err != nil {
		log.Printf("错误: GET %s 失败: %v\n", configsURL, err)
		fallbackTestDefaultPorts(task)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("错误: GET %s 返回状态码 %d, Body: %s\n", configsURL, resp.StatusCode, string(bodyBytes))
		fallbackTestDefaultPorts(task)
		return
	}

	var configData ConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&configData); err != nil {
		log.Printf("错误: 解析 %s 的JSON响应失败: %v\n", configsURL, err)
		fallbackTestDefaultPorts(task)
		return
	}

	log.Printf("信息: %s:%s - 初始 allow-lan: %v, socks-port: %d, mixed-port: %d\n", task.IP, task.Port, configData.AllowLan, configData.SocksPort, configData.MixedPort)

	// 2) 若 allow-lan 为 false，尝试 PATCH
	if !configData.AllowLan {
		log.Printf("信息: %s:%s - allow-lan 为 false, 尝试 PATCH...\n", task.IP, task.Port)
		patchPayload := PatchPayload{AllowLan: true}
		payloadBytes, err := json.Marshal(patchPayload)
		if err != nil {
			log.Printf("错误: 序列化PATCH payload失败 %s: %v\n", configsURL, err)
			fallbackTestDefaultPorts(task)
			return
		}

		patchReq, err := http.NewRequest("PATCH", configsURL, bytes.NewBuffer(payloadBytes))
		if err != nil {
			log.Printf("错误: 无法创建PATCH请求 %s: %v\n", configsURL, err)
			fallbackTestDefaultPorts(task)
			return
		}
		patchReq.Header.Set("Content-Type", "application/json")

		patchResp, err := httpClient.Do(patchReq)
		if err != nil {
			log.Printf("错误: PATCH %s 失败: %v\n", configsURL, err)
			fallbackTestDefaultPorts(task)
			return
		}
		defer patchResp.Body.Close()

		if patchResp.StatusCode != http.StatusOK && patchResp.StatusCode != http.StatusNoContent && patchResp.StatusCode != http.StatusAccepted {
			bodyBytes, _ := io.ReadAll(patchResp.Body)
			log.Printf("错误: PATCH %s 返回状态码 %d, Body: %s\n", configsURL, patchResp.StatusCode, string(bodyBytes))
			fallbackTestDefaultPorts(task)
			return
		}
		log.Printf("信息: %s:%s - PATCH 成功, allow-lan 设置为 true\n", task.IP, task.Port)
		configData.AllowLan = true
	}

	// 3) 选择 socks 端口
	socks5Port := configData.SocksPort
	if socks5Port == 0 {
		socks5Port = configData.MixedPort
	}
	if socks5Port == 0 {
		log.Printf("错误: %s:%s - 未找到有效的SOCKS端口 (socks-port: %d, mixed-port: %d)\n", task.IP, task.Port, configData.SocksPort, configData.MixedPort)
		fallbackTestDefaultPorts(task)
		return
	}
	log.Printf("信息: %s:%s - 使用SOCKS端口: %d\n", task.IP, task.Port, socks5Port)

	// 4) 创建 SOCKS 拨号器
	socksAddr := fmt.Sprintf("%s:%d", task.IP, socks5Port)
	dialer, err := proxy.SOCKS5("tcp", socksAddr, nil, &net.Dialer{
		Timeout:   socksDialTimeout,
		KeepAlive: 0,
	})
	if err != nil {
		log.Printf("错误: %s:%s - 创建SOCKS5拨号器失败 (%s): %v\n", task.IP, task.Port, socksAddr, err)
		fallbackTestDefaultPorts(task)
		return
	}

	// 5) 通过代理测试 URL
	proxyTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		},
	}

	proxyClient := &http.Client{
		Transport: &headerAuthTransport{Transport: proxyTransport},
		Timeout:   httpClientTimeout,
	}

	log.Printf("信息: %s:%s - 通过SOCKS代理测试URL: %s\n", task.IP, task.Port, socksTestURL)
	enteredSocksTestStep = true // 从这一行起，视为已"到达 socks 试代理这一步"

	getResp, err := proxyClient.Get(socksTestURL)
	if err != nil {
		log.Printf("错误: %s:%s - 通过SOCKS代理请求 %s 失败: %v\n", task.IP, task.Port, socksTestURL, err)
		// 注意：已到达 socks 测试步骤，不再回退。
		return
	}
	defer getResp.Body.Close()

	if getResp.StatusCode != http.StatusNoContent {
		log.Printf("错误: %s:%s - SOCKS代理测试返回非预期的状态码 %d (期望 %d) from %s\n", task.IP, task.Port, getResp.StatusCode, http.StatusNoContent, socksTestURL)
		// 注意：已到达 socks 测试步骤，不再回退。
		return
	}

	log.Printf("成功: %s:%s - SOCKS5代理连通性测试成功 (URL: %s, Status: %s)\n", task.IP, task.Port, socksTestURL, getResp.Status)

	// 6) 新增功能：通过SOCKS代理获取真实的国家信息
	realCountry := getIPInfoViaProxy(dialer, task.City)
	writeOutput(task.IP, socks5Port, realCountry)

	_ = enteredSocksTestStep // 仅用于可读性，逻辑已体现
}

// countCsvDataRows 计算CSV文件中的数据行数（不包括表头）
func countCsvDataRows(filePath string, header []string, ipIdx, portIdx, cityIdx int) (int, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return 0, fmt.Errorf("无法打开CSV文件进行计数 %s: %w", filePath, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	_, err = reader.Read() // 跳过表头
	if err != nil {
		if err == io.EOF {
			return 0, nil
		}
		return 0, fmt.Errorf("读取CSV表头失败（计数时）: %w", err)
	}

	rowCount := 0
	lineNumber := 1
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
	header, err := reader.Read()
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
	_ = tempCsvFileForHeader.Close()
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
	defer func() { _ = csvFile.Close() }()

	outputFile, err = os.OpenFile(outputFileName, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Fatalf("错误: 无法打开或创建输出文件 %s: %v\n", outputFileName, err)
	}
	defer func() { _ = outputFile.Close() }()

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
