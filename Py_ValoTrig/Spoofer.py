import os
import time
import uuid
import random
import re
from ctypes import windll as wdl

import win32con
import win32gui
import win32process

UUID_PATTERN = r'UUID = "([a-f0-9]{32})"'
NUMBER_PATTERN = r'#[0-9]+'


# Function to generate random number strings
def random_number_string(match=None):
    return f"#{random.randint(1000000000000000000000, 9999999999999999999999)}"


# Function to generate multiple random number strings
def random_number_lines(num_lines=5):
    return "\n".join(random_number_string() for _ in range(num_lines))


# Function to ensure UUID and numbers in Opera GX.py
def ensure_uuid_and_numbers_in_file(filename, num_lines=5):
    try:
        with open(filename, "r") as f:
            content = f.read()

        new_uuid = uuid.uuid4().hex
        number_lines = random_number_lines(num_lines)

        # Ensure UUIDs are at the beginning and end of the file
        if not re.search(UUID_PATTERN, content):
            new_content = f'{number_lines}\nUUID = "{new_uuid}"\n{content}\nUUID = "{new_uuid}"\n{number_lines}'
            with open(filename, "w") as f:
                f.write(new_content)
            print(f"Added new UUID and numbers to {filename}: {new_uuid}")
        else:
            content_lines = content.split('\n')
            updated_content = []

            # Ensure random numbers at the beginning
            if not all(re.search(NUMBER_PATTERN, line) for line in content_lines[:num_lines]):
                updated_content.append(number_lines)

            updated_content.extend(content_lines)

            # Ensure random numbers at the end
            if not all(re.search(NUMBER_PATTERN, line) for line in content_lines[-num_lines:]):
                updated_content.append(number_lines)

            # Replace UUID in the file content
            new_uuid_str = f'UUID = "{new_uuid}"'
            content_new = re.sub(UUID_PATTERN, new_uuid_str, "\n".join(updated_content))

            with open(filename, "w") as f:
                f.write(content_new)

            print(f"Ensured UUID and numbers in {filename}")
    except Exception as e:
        print(f"Error ensuring UUID and numbers in {filename}: {e}")


# Function to update UUID and numbers in Opera GX.py
def updateUUID_and_numbers_in_file(filename, new_uuid, num_lines=5):
    try:
        with open(filename, "r") as f:
            content = f.read()

        new_uuid_str = f'UUID = "{new_uuid}"'
        number_lines = random_number_lines(num_lines)

        content_new = re.sub(UUID_PATTERN, new_uuid_str, content)

        lines = content_new.split('\n')
        updated_content = []

        # Ensure random numbers at the beginning
        if not all(re.search(NUMBER_PATTERN, line) for line in lines[:num_lines]):
            updated_content.append(number_lines)

        updated_content.extend(lines)

        # Ensure random numbers at the end
        if not all(re.search(NUMBER_PATTERN, line) for line in lines[-num_lines:]):
            updated_content.append(number_lines)

        content_new = "\n".join(updated_content)

        with open(filename, "w") as f:
            f.write(content_new)

        print(f"Done! New UUID and numbers for {filename}: {new_uuid}")
    except Exception as e:
        print(f"Error updating UUID and numbers in {filename}: {e}")


# Function to replace any number starting with '#' with random 20-digit number
def replace_numbers_in_file(filename):
    try:
        with open(filename, "r") as f:
            content = f.read()

        # Replace any line starting with '#' followed by numbers with a random 20-digit number
        content_new = re.sub(r'#[0-9]+', random_number_string, content)

        with open(filename, "w") as f:
            f.write(content_new)

        print(f"Replaced all numbers starting with '#' in {filename}")
    except Exception as e:
        print(f"Error replacing numbers in {filename}: {e}")


# Main function to manage the spoofing and config updates
def main(operagx_file):
    # Assuming Opera GX.py file needs UUID modification

    ensure_uuid_and_numbers_in_file(operagx_file)  # Ensure UUID is in the file
    new_uuid = uuid.uuid4().hex
    updateUUID_and_numbers_in_file(operagx_file, new_uuid)  # Update UUID in the file
    replace_numbers_in_file(operagx_file)  # Replace any numbers starting with '#' with random 20-digit numbers

    print(f"Spoof complete! {operagx_file} has been updated.")

def set_window_title():
    random_uuid = str(uuid.uuid4())
    current_pid = os.getpid()
    hwnd = win32gui.GetForegroundWindow()
    win32gui.SetWindowText(hwnd, random_uuid)
    handle = win32process.GetCurrentProcess()
    win32process.SetProcessWorkingSetSize(handle, -1, -1)

# Utility to clear the terminal
def cl():
    os.system('cls' if os.name == 'nt' else 'clear')
    # 获取控制台窗口句柄
    console = win32gui.GetForegroundWindow()
    # 隐藏窗口
    # win32gui.ShowWindow(console, win32con.SW_HIDE)

if __name__ == '__main__':
    set_window_title()
    cl()
    main("HaoM.py")