package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

const (
	// 每个IP每天的流量限制 (修正为 1GB)
	limitPerDay = 1 * 1024 * 1024 * 1024
	// 测试时长
	testDuration = 10 * time.Second
)

// UserData 存储每个IP的使用情况
type UserData struct {
	UsedBytes  int64
	LastAccess time.Time
}

// IPLimiter IP流量限制器
type IPLimiter struct {
	sync.Mutex
	users map[string]*UserData
}

// NewIPLimiter 创建一个新的IPLimiter
func NewIPLimiter() *IPLimiter {
	return &IPLimiter{
		users: make(map[string]*UserData),
	}
}

// Allow 检查指定IP是否允许使用给定的字节数
func (l *IPLimiter) Allow(ip string, bytesToAdd int64) bool {
	l.Lock()
	defer l.Unlock()

	data, exists := l.users[ip]
	now := time.Now()

	if exists && !isSameDay(data.LastAccess, now) {
		data.UsedBytes = 0
	}

	if !exists {
		l.users[ip] = &UserData{}
		data = l.users[ip]
	}

	if data.UsedBytes+bytesToAdd > limitPerDay {
		log.Printf("IP %s exceeded daily limit of 1GB. Current usage: %d bytes", ip, data.UsedBytes)
		return false
	}

	return true
}

// AddUsage 增加指定IP的已用流量
func (l *IPLimiter) AddUsage(ip string, bytesUsed int64) {
	l.Lock()
	defer l.Unlock()

	data, exists := l.users[ip]
	if !exists {
		l.users[ip] = &UserData{}
		data = l.users[ip]
	}
	
	now := time.Now()
	if !isSameDay(data.LastAccess, now) {
		data.UsedBytes = 0
	}

	data.UsedBytes += bytesUsed
	data.LastAccess = now
	log.Printf("IP %s used %d bytes. Total today: %d bytes.", ip, bytesUsed, data.UsedBytes)
}

func isSameDay(t1, t2 time.Time) bool {
	y1, m1, d1 := t1.UTC().Date()
	y2, m2, d2 := t2.UTC().Date()
	return y1 == y2 && m1 == m2 && d1 == d2
}

var limiter = NewIPLimiter()

func getIP(r *http.Request) string {
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		return forwarded
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// handleRoot 提供前端页面
func handleRoot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(htmlPage))
}

// handleInfo 提供客户端信息
func handleInfo(w http.ResponseWriter, r *http.Request) {
	ip := getIP(r)
	// 在真实应用中，你会使用GeoIP数据库 (如 MaxMind) 来获取ISP和位置信息
	// 这里我们使用占位符
	userInfo := map[string]string{
		"ip":       ip,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userInfo)
}

func handlePing(w http.ResponseWriter, r *http.Request) {
	ip := getIP(r)
	if !limiter.Allow(ip, 1024) {
		http.Error(w, "Daily limit exceeded", http.StatusTooManyRequests)
		return
	}
	limiter.AddUsage(ip, 1024)
	w.WriteHeader(http.StatusOK)
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	ip := getIP(r)
	if !limiter.Allow(ip, 1) {
		http.Error(w, "Daily limit exceeded", http.StatusTooManyRequests)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	
	chunk := make([]byte, 1024*1024) // 1MB chunk
	_, _ = rand.Read(chunk)

	for {
		if !limiter.Allow(ip, int64(len(chunk))) {
			break
		}
		
		n, err := w.Write(chunk)
		if err != nil {
			break
		}
		limiter.AddUsage(ip, int64(n))
		
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}
	
	ip := getIP(r)
	if !limiter.Allow(ip, 1) {
		http.Error(w, "Daily limit exceeded", http.StatusTooManyRequests)
		return
	}

	bytesWritten, err := io.Copy(io.Discard, r.Body)
	if err != nil {
		// 忽略客户端主动关闭连接的错误
		netErr, ok := err.(net.Error)
		if !ok || !netErr.Timeout() {
			log.Printf("Upload error for IP %s: %v", ip, err)
		}
	}
	defer r.Body.Close()

	if bytesWritten > 0 {
		limiter.AddUsage(ip, bytesWritten)
	}

	w.WriteHeader(http.StatusOK)
}

func main() {
	port := "8080"
	http.HandleFunc("/", handleRoot)
	http.HandleFunc("/info", handleInfo)
	http.HandleFunc("/ping", handlePing)
	http.HandleFunc("/download", handleDownload)
	http.HandleFunc("/upload", handleUpload)

	fmt.Printf("Neobrutalist Speed Test Server is running on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// 前端HTML, CSS, JS代码
const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Go Speed Test :: Neobrutalist Edition</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --background: #f0f0f0;
            --foreground: #111111;
            --primary: #FFFF00; /* Bright Yellow */
            --secondary: #00FFFF; /* Cyan */
            --accent: #FF00FF; /* Magenta */
        }
        
        *, *::before, *::after {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Roboto Mono', monospace;
            background-color: var(--background);
            color: var(--foreground);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 1rem;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        .container {
            width: 100%;
            max-width: 800px;
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }

        .header {
            text-align: center;
            border: 3px solid var(--foreground);
            background-color: var(--primary);
            padding: 1rem;
            box-shadow: 8px 8px 0px var(--foreground);
        }

        .header h1 {
            font-size: clamp(1.5rem, 5vw, 2.5rem);
            font-weight: 700;
        }

        .user-info {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 1rem;
            font-size: 0.8rem;
            background: white;
            padding: 1rem;
            border: 3px solid var(--foreground);
        }
        .user-info span {
            word-break: break-all;
        }

        .gauge-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.5rem;
            padding: 2rem 1rem;
            border: 3px solid var(--foreground);
            background-color: white;
            min-height: 350px;
            justify-content: center;
        }
        
        .gauge-display {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        
        .speed-value {
            font-size: clamp(4rem, 15vw, 8rem);
            font-weight: 700;
            line-height: 1;
            color: var(--foreground);
        }
        
        .speed-details {
            display: flex;
            align-items: baseline;
            gap: 0.5rem;
        }

        .speed-unit {
            font-size: clamp(1.5rem, 5vw, 2.5rem);
            font-weight: 700;
        }
        
        .speed-type {
            font-size: clamp(1rem, 4vw, 1.5rem);
            text-transform: uppercase;
            color: var(--accent);
            background-color: var(--foreground);
            padding: 0.25rem 0.5rem;
        }

        .chart-container {
            width: 100%;
            height: 100px;
            background-color: var(--background);
            border: 3px solid var(--foreground);
            position: relative;
        }
        #speedChart {
            width: 100%;
            height: 100%;
        }

        .start-button {
            font-family: 'Roboto Mono', monospace;
            font-size: 2rem;
            font-weight: 700;
            padding: 1rem 2rem;
            border: 3px solid var(--foreground);
            background-color: var(--secondary);
            color: var(--foreground);
            cursor: pointer;
            box-shadow: 8px 8px 0px var(--foreground);
            transition: transform 0.1s ease, box-shadow 0.1s ease;
            text-transform: uppercase;
        }
        .start-button:hover:not(:disabled) {
            transform: translate(4px, 4px);
            box-shadow: 4px 4px 0px var(--foreground);
        }
        .start-button:active:not(:disabled) {
            transform: translate(8px, 8px);
            box-shadow: 0px 0px 0px var(--foreground);
        }
        .start-button:disabled {
            background-color: #ccc;
            color: #777;
            cursor: not-allowed;
            box-shadow: none;
            transform: translate(8px, 8px);
        }

        .results-section {
            display: none; /* Initially hidden */
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 1.5rem;
            margin-top: 1rem;
        }

        .result-box {
            background: white;
            border: 3px solid var(--foreground);
            padding: 1rem;
            text-align: center;
            box-shadow: 8px 8px 0px var(--foreground);
        }
        .result-box h2 {
            font-size: 1rem;
            margin-bottom: 0.5rem;
            text-transform: uppercase;
        }
        .result-box .value {
            font-size: 2.5rem;
            font-weight: 700;
        }
        .result-box .unit {
            font-size: 1rem;
        }
    </style>
</head>
<body>
    <main class="container">
        <header class="header">
            <h1>Cc Speed Test</h1>
        </header>

        <section class="user-info">
            <span id="ip_address">IP: Fetching...</span>
        </section>

        <section class="gauge-section">
            <div class="gauge-display">
                <span id="speed-value" class="speed-value">0.00</span>
                <div class="speed-details">
                    <span id="speed-unit" class="speed-unit">Mbps</span>
                    <span id="speed-type" class="speed-type">Waiting</span>
                </div>
            </div>
            <div class="chart-container">
                <canvas id="speedChart"></canvas>
            </div>
            <button id="startButton" class="start-button">GO</button>
        </section>

        <section id="resultsSection" class="results-section">
            <div class="result-box">
                <h2>Ping</h2>
                <span class="value" id="pingValue">-</span>
                <span class="unit">ms</span>
            </div>
            <div class="result-box">
                <h2>Jitter</h2>
                <span class="value" id="jitterValue">-</span>
                <span class="unit">ms</span>
            </div>
            <div class="result-box">
                <h2>Download</h2>
                <span class="value" id="dlValue">-</span>
                <span class="unit">Mbps</span>
            </div>
            <div class="result-box">
                <h2>Upload</h2>
                <span class="value" id="ulValue">-</span>
                <span class="unit">Mbps</span>
            </div>
        </section>
    </main>

    <script>
        // DOM Elements
        const startButton = document.getElementById('startButton');
        const speedValueEl = document.getElementById('speed-value');
        const speedUnitEl = document.getElementById('speed-unit');
        const speedTypeEl = document.getElementById('speed-type');
        
        const resultsSection = document.getElementById('resultsSection');
        const pingValueEl = document.getElementById('pingValue');
        const jitterValueEl = document.getElementById('jitterValue');
        const dlValueEl = document.getElementById('dlValue');
        const ulValueEl = document.getElementById('ulValue');

        // Chart
        const canvas = document.getElementById('speedChart');
        const ctx = canvas.getContext('2d');
        let speedHistory = [];

        // Test Configuration
        const TEST_DURATION = 10000; // 10 seconds in milliseconds
        const PING_COUNT = 10;
        const UPDATE_INTERVAL = 250; // Update UI every 250ms

        let testState = 'idle'; // idle, ping, download, upload, finished

        // --- Chart Drawing ---
        function drawChart() {
            const width = canvas.width;
            const height = canvas.height;
            ctx.clearRect(0, 0, width, height);

            if (speedHistory.length < 2) return;

            const maxSpeed = Math.max(...speedHistory, 1); // Avoid division by zero
            
            ctx.strokeStyle = 'var(--accent)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            
            for (let i = 0; i < speedHistory.length; i++) {
                const x = (i / (speedHistory.length - 1)) * width;
                const y = height - (speedHistory[i] / maxSpeed) * height * 0.9; // Use 90% of height
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        function resizeCanvas() {
            const rect = canvas.parentElement.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            drawChart();
        }

        // --- UI Update Functions ---
        function updateGauge(speed, unit, type) {
            speedValueEl.textContent = speed;
            speedUnitEl.textContent = unit;
            speedTypeEl.textContent = type;
        }

        function resetUI() {
            updateGauge('0.00', 'Mbps', 'Waiting');
            pingValueEl.textContent = '-';
            jitterValueEl.textContent = '-';
            dlValueEl.textContent = '-';
            ulValueEl.textContent = '-';
            resultsSection.style.display = 'none';
            speedHistory = [];
            drawChart();
        }

        async function fetchUserInfo() {
            try {
                const response = await fetch('/info');
                const data = await response.json();
                document.getElementById('ip_address').textContent = 'IP: ' + data.ip;
            } catch (error) {
                console.error('Failed to fetch user info:', error);
                document.getElementById('ip_address').textContent = 'IP: Error';
            }
        }
        
        // --- Test Logic ---
        async function testPing() {
            testState = 'ping';
            updateGauge('...', 'ms', 'Ping');
            speedHistory = [];
            drawChart();

            let pings = [];
            for (let i = 0; i < PING_COUNT; i++) {
                const startTime = Date.now();
                await fetch('/ping?t=' + startTime);
                const latency = Date.now() - startTime;
                pings.push(latency);
                updateGauge(latency, 'ms', 'Ping');
                await new Promise(resolve => setTimeout(resolve, 100)); // wait between pings
            }

            const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
            
            let jitter = 0;
            for (let i = 0; i < pings.length - 1; i++) {
                jitter += Math.abs(pings[i] - pings[i+1]);
            }
            jitter = jitter / (pings.length - 1);

            pingValueEl.textContent = avgPing.toFixed(0);
            jitterValueEl.textContent = jitter.toFixed(2);
        }

        async function testDownload() {
            testState = 'download';
            updateGauge('0.00', 'Mbps', 'Download');
            speedHistory = [];
            
            const controller = new AbortController();
            const signal = controller.signal;
            setTimeout(() => controller.abort(), TEST_DURATION);

            let totalBytes = 0;
            let lastTimestamp = Date.now();
            let lastBytes = 0;
            let updateIntervalId;

            try {
                const response = await fetch('/download', { signal });
                if (!response.ok) throw new Error('HTTP error! status: ${response.status}');
                const reader = response.body.getReader();

                updateIntervalId = setInterval(() => {
                    const now = Date.now();
                    const interval = (now - lastTimestamp) / 1000;
                    if (interval > 0) {
                        const bytesSinceLast = totalBytes - lastBytes;
                        const speedMbps = (bytesSinceLast * 8) / (interval * 1000000);
                        updateGauge(speedMbps.toFixed(2), 'Mbps', 'Download');
                        speedHistory.push(speedMbps);
                        drawChart();
                    }
                    lastTimestamp = now;
                    lastBytes = totalBytes;
                }, UPDATE_INTERVAL);
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalBytes += value.length;
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Download test error:', err);
                    updateGauge('Error', '', 'Download');
                    throw err;
                }
            } finally {
                clearInterval(updateIntervalId);
            }
            
            const totalDuration = TEST_DURATION / 1000;
            const finalSpeedMbps = (totalBytes * 8) / (totalDuration * 1000000);
            updateGauge(finalSpeedMbps.toFixed(2), 'Mbps', 'Download');
            dlValueEl.textContent = finalSpeedMbps.toFixed(2);
        }

        async function testUpload() {
            testState = 'upload';
            updateGauge('0.00', 'Mbps', 'Upload');
            speedHistory = [];
            
            const chunkSize = 256 * 1024; // 256KB
            const data = new Uint8Array(chunkSize);

            const controller = new AbortController();
            const signal = controller.signal;
            setTimeout(() => controller.abort(), TEST_DURATION);

            let totalBytes = 0;
            let lastTimestamp = Date.now();
            let lastBytes = 0;
            let updateIntervalId;
            let testStartTime = Date.now();

            updateIntervalId = setInterval(() => {
                const now = Date.now();
                const interval = (now - lastTimestamp) / 1000;
                if (interval > 0) {
                    const bytesSinceLast = totalBytes - lastBytes;
                    const speedMbps = (bytesSinceLast * 8) / (interval * 1000000);
                    updateGauge(speedMbps.toFixed(2), 'Mbps', 'Upload');
                    speedHistory.push(speedMbps);
                    drawChart();
                }
                lastTimestamp = now;
                lastBytes = totalBytes;
            }, UPDATE_INTERVAL);
            
            try {
                const uploadPromises = [];
                // Start multiple concurrent uploads to saturate connection
                for (let i = 0; i < 4; i++) {
                    const upload = async () => {
                        while (Date.now() - testStartTime < TEST_DURATION) {
                            await fetch('/upload', { method: 'POST', body: data, signal });
                            totalBytes += chunkSize;
                        }
                    };
                    uploadPromises.push(upload());
                }
                await Promise.all(uploadPromises);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Upload test error:', err);
                    updateGauge('Error', '', 'Upload');
                    throw err;
                }
            } finally {
                clearInterval(updateIntervalId);
            }

            const totalDuration = (Date.now() - testStartTime) / 1000;
            const finalSpeedMbps = (totalBytes * 8) / (totalDuration * 1000000);
            updateGauge(finalSpeedMbps.toFixed(2), 'Mbps', 'Upload');
            ulValueEl.textContent = finalSpeedMbps.toFixed(2);
        }

        // --- Main Controller ---
        async function startTest() {
            if (testState !== 'idle' && testState !== 'finished') return;
            
            testState = 'starting';
            startButton.disabled = true;
            startButton.textContent = "Testing...";
            resetUI();
            resultsSection.style.display = 'grid'; // Show it now
            
            try {
                await testPing();
                await testDownload();
                await testUpload();
                
                testState = 'finished';
                startButton.textContent = "Test Again";
                updateGauge(dlValueEl.textContent, 'Mbps', 'Complete');

            } catch (error) {
                console.error("Test failed:", error);
                testState = 'finished'; // Allow re-test
                startButton.textContent = "Retry";
                alert("An error occurred during the test. Please check the console for details.");
            } finally {
                startButton.disabled = false;
            }
        }

        // --- Event Listeners ---
        startButton.addEventListener('click', startTest);
        window.addEventListener('resize', resizeCanvas);
        
        // --- Initial Load ---
        document.addEventListener('DOMContentLoaded', () => {
            fetchUserInfo();
            resizeCanvas();
        });
    </script>
</body>
</html>
`
