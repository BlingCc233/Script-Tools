-- email.lua

-- 生成候选词的辅助函数
local function yield_cand(seg, text)
	-- 创建一个候选对象
	-- Candidate(type, start, end, text, comment)
	-- comment 参数可以在候选词后面显示一个提示，比如 "邮箱"
	local cand = Candidate("email", seg.start, seg._end, text, "邮箱")
	-- 设置一个较高的质量（优先级），使其能排在候选列表的前面
	cand.quality = 1000
	-- 将候选词提交给 Rime
	yield(cand)
end

-- 将你要候选的邮箱地址存储在一个表中，方便未来修改或添加
local emails = {
	"xxx@gmail.com",
	"xxx@qq.com",
}

-- 创建模块
local M = {}

-- 初始化函数，在 Rime 加载时调用
function M.init(env)
	-- 从 YAML 配置中读取触发关键字
	-- env.name_space 在 YAML 中是 "*email_translator"，我们去掉 "*" 得到 "email_translator"
	local config_key = env.name_space:gsub("^*", "")
	-- 如果 YAML 中配置了 email_translator: "your_key"，就使用 "your_key"
	-- 否则，默认使用 "@" 作为触发关键字
	M.trigger = env.engine.schema.config:get_string(config_key) or "@"
end

-- 转换器主函数，每次输入时都会被调用
function M.func(input, seg, _)
	-- 检查用户的输入是否与我们设置的触发关键字完全匹配
	if input == M.trigger then
		-- 如果匹配，就遍历上面定义的 emails 表
		for _, email_address in ipairs(emails) do
			-- 为列表中的每个邮箱地址生成一个候选词
			yield_cand(seg, email_address)
		end
	end
end

-- 返回模块
return M
