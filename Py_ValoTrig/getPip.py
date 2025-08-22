import subprocess
import sys
import os


def check_pip():
    try:
        import pip
        return True
    except ImportError:
        return False


def install_pip():
    try:
        # 下载get-pip.py
        subprocess.check_call([sys.executable, "-c",
                               "import urllib.request; urllib.request.urlretrieve('https://bootstrap.pypa.io/get-pip.py', 'get-pip.py')"])

        # 安装pip
        subprocess.check_call([sys.executable, "get-pip.py"])

        # 删除get-pip.py
        os.remove("get-pip.py")

        print("pip 安装成功!")
        return True
    except Exception as e:
        print(f"安装pip时出错: {str(e)}")
        return False


def set_pip_source():
    try:
        # Windows下pip配置目录
        pip_dir = os.path.join(os.environ['USERPROFILE'], 'pip')
        if not os.path.exists(pip_dir):
            os.makedirs(pip_dir)

        # 写入清华源配置
        config_content = '''[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
[install]
trusted-host = pypi.tuna.tsinghua.edu.cn'''

        with open(os.path.join(pip_dir, 'pip.ini'), 'w') as f:
            f.write(config_content)

        print("已设置pip源为清华源!")
        return True
    except Exception as e:
        print(f"设置pip源时出错: {str(e)}")
        return False


def install_requirements():
    requirements = [
        'opencv-python',  # cv2
        'numpy',
        'pywin32',  # win32api
        'bettercam',
        'keyboard',
        'pillow'
    ]

    try:
        for package in requirements:
            print(f"正在安装 {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--no-cache-dir", package])
        print("所有依赖包安装成功!")
        return True
    except Exception as e:
        print(f"安装依赖包时出错: {str(e)}")
        return False


def main():
    print("开始检查和配置环境...")

    # 检查是否安装pip
    if not check_pip():
        print("未检测到pip，正在安装...")
        if not install_pip():
            print("pip安装失败，程序退出")
            return False
    else:
        print("检测到pip已安装")

    # 设置清华源
    if not set_pip_source():
        print("设置清华源失败，但将继续执行")

    # 安装所需包
    if not install_requirements():
        print("安装依赖包失败，程序退出")
        return False

    print("所有配置和安装已完成!")
    return True


if __name__ == "__main__":
    main()
