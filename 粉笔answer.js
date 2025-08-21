// ==Fenbi Answer Finder==
// @version      1.3
// @description  Automates finding answers for Fenbi questions. (Enhanced JSON parsing)
// @author       BlingCc
// ==/Fenbi Answer Finder==

(async () => {
    /**************************************************************************************************/
    /*                                        ⬇️ 使用说明 ⬇️                                            */
    /* 1. 严格按照说明，从 Network 面板中请求的 "Response" 选项卡复制完整的 JSON 响应。                */
    /* 2. 将复制的内容粘贴在下面的两个反引号 `` ` `` 之间。                                             */
    /* 3. 将整个脚本粘贴到浏览器F12控制台并回车运行。                                                  */
    /**************************************************************************************************/

    const initialQuestionsResponseJSON = ``; // <--- 在这里粘贴你的JSON (注意是反引号)

    /**************************************************************************************************/
    /*                                        ⬆️ 粘贴区域 ⬆️                                            */
    /*                                     （脚本主体，勿动）                                           */
    /**************************************************************************************************/

    // --- 配置区 ---
    const SNIPPET_LENGTH = 30;
    const REQUEST_DELAY = 200; 

    // --- 辅助函数 ---

    const stripHtml = (html) => {
        if (!html) return '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        return (tempDiv.textContent || tempDiv.innerText || '').trim();
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 改进的JSON清理函数
    const cleanJsonString = (jsonStr) => {
        // 移除可能的BOM标记
        jsonStr = jsonStr.replace(/^\uFEFF/, '');
        
        // 移除首尾的空白字符
        jsonStr = jsonStr.trim();
        
        // 处理HTML标签，特别是img标签
        // 先统计一下有多少个img标签
        const imgMatches = jsonStr.match(/<img[^>]*>/gi);
        if (imgMatches && imgMatches.length > 0) {
            console.log(`检测到 ${imgMatches.length} 个img标签，正在清理...`);
            
            // 将所有HTML标签替换为安全的文本描述
            jsonStr = jsonStr.replace(/<img[^>]*>/gi, '[图片]');
            jsonStr = jsonStr.replace(/<br\s*\/?>/gi, ' '); // 替换换行标签
            jsonStr = jsonStr.replace(/<\/?(p|div|span)[^>]*>/gi, ''); // 移除常见块级标签
            jsonStr = jsonStr.replace(/<[^>]+>/g, ''); // 移除其他所有HTML标签
            
            console.log('✅ HTML标签清理完成');
        }
        
        // 处理可能的转义问题
        // 修复可能的双重转义
        jsonStr = jsonStr.replace(/\\"/g, '"');
        jsonStr = jsonStr.replace(/\\\\"/g, '\\"');
        
        // 检查并移除可能的前缀（如果有的话）
        if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
            const firstBrace = jsonStr.indexOf('{');
            const firstBracket = jsonStr.indexOf('[');
            let startPos = -1;
            
            if (firstBrace !== -1 && firstBracket !== -1) {
                startPos = Math.min(firstBrace, firstBracket);
            } else if (firstBrace !== -1) {
                startPos = firstBrace;
            } else if (firstBracket !== -1) {
                startPos = firstBracket;
            }
            
            if (startPos > 0) {
                console.log(`检测到JSON前有 ${startPos} 个字符的前缀，已自动移除`);
                jsonStr = jsonStr.substring(startPos);
            }
        }
        
        return jsonStr;
    };

    // 改进的JSON解析函数
    const parseJsonSafely = (jsonStr) => {
        try {
            // 首先尝试直接解析
            return JSON.parse(jsonStr);
        } catch (firstError) {
            console.log('首次解析失败，尝试清理JSON...', firstError.message);
            
            try {
                // 清理并再次尝试
                const cleanedJson = cleanJsonString(jsonStr);
                return JSON.parse(cleanedJson);
            } catch (secondError) {
                console.log('清理后仍然失败，尝试错误定位...');
                
                // 尝试定位错误位置
                const match = secondError.message.match(/position (\d+)/);
                if (match) {
                    const errorPos = parseInt(match[1]);
                    const start = Math.max(0, errorPos - 50);
                    const end = Math.min(jsonStr.length, errorPos + 50);
                    console.log('错误位置附近的内容:');
                    console.log(jsonStr.substring(start, end));
                    console.log(' '.repeat(errorPos - start) + '^-- 错误位置');
                }
                
                throw new Error(`JSON解析失败: ${secondError.message}。请检查JSON格式是否正确。`);
            }
        }
    };

    const fetchData = async (url) => {
        try {
            const response = await fetch(url, {
                credentials: 'include' 
            });
            if (!response.ok) {
                console.error(`请求失败，状态码: ${response.status}`, url);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error('网络请求异常:', error, url);
            return null;
        }
    };
    
    const formatChoiceIndex = (choiceIndex) => {
        const index = parseInt(choiceIndex, 10);
        if (!isNaN(index) && index >= 0) {
            return String.fromCharCode(65 + index);
        }
        return choiceIndex;
    };

    const formatFinalAnswer = (question, solution) => {
        const questionText = stripHtml(question.content);
        const correctAnswer = solution.correctAnswer;
        let answerText = '未找到答案';

        if (correctAnswer) {
            if (correctAnswer.type === 201 && correctAnswer.choice) {
                const choiceIndex = parseInt(correctAnswer.choice, 10);
                const optionsAccessory = question.accessories && question.accessories.find(acc => acc.type === 101);
                if (optionsAccessory && optionsAccessory.options && optionsAccessory.options[choiceIndex]) {
                    const letter = formatChoiceIndex(correctAnswer.choice);
                    answerText = `${letter}. ${optionsAccessory.options[choiceIndex]}`;
                } else {
                    answerText = `选项 ${formatChoiceIndex(correctAnswer.choice)}`;
                }
            } else {
                answerText = JSON.stringify(correctAnswer);
            }
        }
        
        return `✅ ${questionText}\n   ➡️ 答案: ${answerText}`;
    };

    // --- 主逻辑 ---

    console.log('%c🚀 粉笔答案查找脚本已启动 (v1.3 - Enhanced JSON Parsing)...', 'color: blue; font-size: 16px;');

    if (!initialQuestionsResponseJSON || initialQuestionsResponseJSON.trim() === '') {
        console.error('❌ 错误：请将JSON响应数据粘贴到 initialQuestionsResponseJSON 变量中。');
        return;
    }

    let initialData;
    try {
        console.log('开始解析JSON数据...');
        initialData = parseJsonSafely(initialQuestionsResponseJSON);
        console.log('✅ JSON解析成功！');
    } catch (e) {
        console.error('❌ 错误：', e.message);
        console.log('\n🔧 排查建议：');
        console.log('1. 确保从Network面板的Response选项卡复制了完整的JSON');
        console.log('2. 检查JSON中是否有特殊字符或格式错误');
        console.log('3. 尝试使用在线JSON验证工具检查JSON格式');
        return;
    }

    // 验证数据结构
    if (!initialData.questions || !Array.isArray(initialData.questions)) {
        console.error('❌ 错误：JSON数据中缺少questions数组或格式不正确');
        return;
    }

    const { materials, questions } = initialData;
    const finalResults = [];
    const solutionsMap = new Map();

    // 处理材料（如果有的话）
    if (materials && materials.length > 0) {
        console.log(`\n🔍 检测到 ${materials.length} 份材料，正在处理...`);
        for (const material of materials) {
            const queryText = stripHtml(material.content).substring(0, SNIPPET_LENGTH);
            const encodedQuery = encodeURIComponent(queryText);
            const searchUrl = `https://algo.fenbi.com/api/fenbi-question-search/question?q=${encodedQuery}&coursePrefix=xingce&offset=0&length=15&format=html&sourceType=0&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;

            console.log(`   - 正在搜索材料ID: ${material.id}...`);
            const searchResult = await fetchData(searchUrl);
            await sleep(REQUEST_DELAY);

            if (!searchResult || !searchResult.data || !searchResult.data.items) {
                console.warn(`   - 材料ID ${material.id} 的搜索请求失败或无结果。`);
                continue;
            }

            const matchedItem = searchResult.data.items.find(item => item.materialId === material.id);

            if (matchedItem && matchedItem.encodeCheckInfo) {
                const { encodeCheckInfo } = matchedItem;
                const solutionUrl = `https://tiku.fenbi.com/api/xingce/universal/auth/solutions?type=8&id=${material.id}&checkId=${encodeCheckInfo}&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;
                
                console.log(`   - 已找到材料ID ${material.id} 的checkInfo，正在获取答案...`);
                const solutionsData = await fetchData(solutionUrl);
                await sleep(REQUEST_DELAY);

                if (solutionsData && solutionsData.solutions) {
                    solutionsData.solutions.forEach(sol => {
                        solutionsMap.set(sol.id, sol);
                    });
                    console.log(`   - 成功获取材料ID ${material.id} 关联的 ${solutionsData.solutions.length} 个答案。`);
                } else {
                    console.warn(`   - 获取材料ID ${material.id} 的答案失败。`);
                }
            } else {
                console.warn(`   - 未能在搜索结果中找到与材料ID ${material.id} 匹配的项。`);
            }
        }
    }

    console.log(`\n🧠 开始处理全部 ${questions.length} 道题目...`);
    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        console.log(`\n--- [${i + 1}/${questions.length}] 处理题目ID: ${question.id} ---`);

        if (solutionsMap.has(question.id)) {
            const solution = solutionsMap.get(question.id);
            finalResults.push(formatFinalAnswer(question, solution));
            console.log(`   - (来自材料) 题目ID ${question.id} 的答案已找到。`);
            continue;
        }

        const queryText = stripHtml(question.content).substring(0, SNIPPET_LENGTH);
        const encodedQuery = encodeURIComponent(queryText);
        const searchUrl = `https://algo.fenbi.com/api/fenbi-question-search/question?q=${encodedQuery}&coursePrefix=xingce&offset=0&length=15&format=html&sourceType=0&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;

        console.log(`   - (独立搜索) 正在搜索题目ID: ${question.id}...`);
        const searchResult = await fetchData(searchUrl);
        await sleep(REQUEST_DELAY);

        if (!searchResult || !searchResult.data || !searchResult.data.items) {
            console.warn(`   - 题目ID ${question.id} 的搜索请求失败或无结果。`);
            finalResults.push(`❌ ${stripHtml(question.content)}\n   ➡️ 答案: 未能通过搜索找到答案`);
            continue;
        }

        const matchedItem = searchResult.data.items.find(item => item.questionId === question.id);

        if (matchedItem && matchedItem.encodeCheckInfo) {
            const { encodeCheckInfo } = matchedItem;
            const solutionUrl = `https://tiku.fenbi.com/api/xingce/universal/auth/solutions?type=6&questionIds=${question.id}&checkId=${encodeCheckInfo}&app=web&kav=100&av=100&hav=100&version=3.0.0.0`;
            
            console.log(`   - 已找到题目ID ${question.id} 的checkInfo，正在获取答案...`);
            const solutionData = await fetchData(solutionUrl);
            await sleep(REQUEST_DELAY);

            if (solutionData && solutionData.solutions && solutionData.solutions.length > 0) {
                finalResults.push(formatFinalAnswer(question, solutionData.solutions[0]));
                console.log(`   - 成功获取题目ID ${question.id} 的答案。`);
            } else {
                console.warn(`   - 获取题目ID ${question.id} 的答案失败。`);
                finalResults.push(`❌ ${stripHtml(question.content)}\n   ➡️ 答案: 获取答案失败`);
            }
        } else {
            console.warn(`   - 未能在搜索结果中找到与题目ID ${question.id} 匹配的项。`);
            finalResults.push(`❌ ${stripHtml(question.content)}\n   ➡️ 答案: 搜索无匹配项`);
        }
    }
    
    console.log('\n\n==================================================');
    console.log('%c🎉 全部题目处理完成！最终答案如下：', 'color: green; font-size: 20px; font-weight: bold;');
    console.log('==================================================\n');
    
    console.log(finalResults.join('\n\n'));
    console.log('\n==================================================');

})();
