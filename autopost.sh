#!/bin/bash

# 脚本的目标目录
TARGET_DIR="TODO"
# gosocks 可执行文件路径 (假设在 TARGET_DIR 中)
GOSOCKS_EXEC="./gosocks"
# gosocks 生成的输出文件名
GOSOCKS_RAW_OUTPUT_FILE="output2.txt"
# nohup 日志
NOHUP_LOG="nohup_gosocks.log"
# Python 脚本使用的最终输入文件
FINAL_OUTPUT_FILE="output.txt"

# Python 转换脚本和它们的输出文件名
PYTHON_CONVERTER1="converter.py"
PYTHON_OUTPUT1="clash.yaml"
PYTHON_CONVERTER2="converter2.py"
PYTHON_OUTPUT2="singbox.json"
PYTHON_CONVERTER3="converter3.py"
PYTHON_OUTPUT3="surge_config.conf"

echo "--- 开始执行 gosocks 及转换任务 (单次运行) ---"

# 1. 切换到目标目录
echo "正在切换到目录: $TARGET_DIR"
\cd "$TARGET_DIR"
# 检查 cd 是否成功
if [ "$PWD" != "$TARGET_DIR" ]; then
  echo "错误: 无法切换到目录 $TARGET_DIR。请检查路径是否存在以及是否有权限。"
  exit 1
fi
echo "当前工作目录: $(pwd)"

# --- 执行 gosocks 命令 ---
echo "正在使用 nohup 执行 gosocks 命令: $GOSOCKS_EXEC data.csv 5"
echo "此命令的输出 (stdout/stderr) 将被重定向到 $TARGET_DIR/$NOHUP_LOG"
# 执行前确保旧的输出文件(如果存在)不会干扰
rm -f  "$FINAL_OUTPUT_FILE"

nohup "$GOSOCKS_EXEC" data.csv 20 > "$NOHUP_LOG" 2>&1 &
PID1=$!
echo "gosocks 进程已启动，PID: $PID1。正在等待其完成..."
wait $PID1
echo "gosocks 进程 (PID: $PID1) 已完成。"

# --- 处理 gosocks 输出 ---
if [ -f "$GOSOCKS_RAW_OUTPUT_FILE" ]; then
  echo "gosocks 命令生成了 $GOSOCKS_RAW_OUTPUT_FILE。将其重命名/复制为 $FINAL_OUTPUT_FILE"
  cat "$GOSOCKS_RAW_OUTPUT_FILE" >> "$FINAL_OUTPUT_FILE"
  if [ $? -eq 0 ]; then
    echo "$FINAL_OUTPUT_FILE 已成功创建。"
  else
    echo "错误: 将 $GOSOCKS_RAW_OUTPUT_FILE 重命名/移动到 $FINAL_OUTPUT_FILE 失败。"
    echo "将尝试创建一个空的 $FINAL_OUTPUT_FILE 以便脚本继续，但这可能不是预期行为。"
    touch "$FINAL_OUTPUT_FILE"
  fi
else
  echo "警告: gosocks 命令未生成 $GOSOCKS_RAW_OUTPUT_FILE。"
  echo "将创建一个空的 $FINAL_OUTPUT_FILE。Python 脚本可能无法正常工作。"
  touch "$FINAL_OUTPUT_FILE"
fi

# --- 执行 Python 转换脚本 ---
if [ -s "$FINAL_OUTPUT_FILE" ]; then # -s 检查文件是否存在且非空
  echo "使用 $FINAL_OUTPUT_FILE 执行 Python 转换脚本..."

  # 定义一个辅助函数来运行python命令并检查错误
  run_python_converter() {
    local script_name="$1"
    local input_f="$2"
    local output_opt="$3"
    local output_f="$4"
    echo "正在执行: python $script_name $input_f $output_opt $output_f"
    # 假设python脚本在当前目录 (TARGET_DIR) 或 PATH 中
    python3 "$script_name" "$input_f" "$output_opt" "$output_f"
    if [ $? -eq 0 ]; then
      echo "成功: $output_f 已生成。"
    else
      echo "错误: 执行 $script_name 生成 $output_f 失败。退出码: $?"
    fi
  }

  run_python_converter "$PYTHON_CONVERTER1" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT1"
  run_python_converter "$PYTHON_CONVERTER2" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT2"
  run_python_converter "$PYTHON_CONVERTER3" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT3"

elif [ -f "$FINAL_OUTPUT_FILE" ]; then # 文件存在但为空
  echo "警告: $FINAL_OUTPUT_FILE 为空。Python 转换脚本可能无法正常工作或会报错。"
  echo "仍将尝试执行 Python 转换脚本..."
  run_python_converter "$PYTHON_CONVERTER1" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT1"
  run_python_converter "$PYTHON_CONVERTER2" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT2"
  run_python_converter "$PYTHON_CONVERTER3" "$FINAL_OUTPUT_FILE" "-o" "$PYTHON_OUTPUT3"
else
  echo "错误: $FINAL_OUTPUT_FILE 未找到 (这不应该发生，因为前面有touch)。跳过 Python 转换脚本的执行。"
fi

echo "--- gosocks 及转换任务脚本执行完毕 ---"
echo "gosocks 命令的日志位于: $TARGET_DIR/$NOHUP_LOG"
echo "用于转换的输入文件是: $TARGET_DIR/$FINAL_OUTPUT_FILE"
echo "Python 转换输出文件应位于: $TARGET_DIR 下的 $PYTHON_OUTPUT1, $PYTHON_OUTPUT2, $PYTHON_OUTPUT3"

python3 post.py

exit 0
