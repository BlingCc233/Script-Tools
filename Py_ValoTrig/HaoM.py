import os
import time
import uuid
import random
import re
import string
from ctypes import windll as wdl
import win32con
import win32gui
import win32process

def random_junk_generator():
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(random.randint(40, 150)))

def generate_dynamic_junk_func():
    f_name = "sys_" + ''.join(random.choices(string.ascii_lowercase, k=random.randint(6, 12)))
    v_name = ''.join(random.choices(string.ascii_lowercase, k=random.randint(4, 8)))
    return f"\ndef {f_name}():\n    {v_name} = '{random_junk_generator()}'\n    return hash({v_name})\n"

def random_number_string():
    return f"#{random.randint(1000000000000000000000, 9999999999999999999999)}"

def timestomp_file(filepath):
    try:
        now = time.time()
        random_past = now - random.randint(86400, 31536000) 
        os.utime(filepath, (random_past, random_past))
    except Exception:
        pass

def spoof_target(filename):
    if not os.path.exists(filename):
        return

    try:
        with open(filename, "r", encoding="utf-8") as f:
            lines = f.readlines()

        new_uuid = uuid.uuid4().hex
        processed = []
        
        for line in lines:
            if re.search(r'UUID\s*=\s*"[a-fA-F0-9]{32}"', line):
                processed.append(f'UUID = "{new_uuid}"\n')
            elif re.match(r'^#\s*\d{15,}', line.strip()):
                processed.append(random_number_string() + "\n")
            else:
                processed.append(line)

        content = "".join(processed)

        if 'UUID =' not in content:
            content = f'UUID = "{new_uuid}"\n' + content + f'\nUUID = "{new_uuid}"\n'

        content += generate_dynamic_junk_func()

        top_block = "\n".join(random_number_string() for _ in range(random.randint(4, 8))) + "\n"
        bottom_block = "\n".join(random_number_string() for _ in range(random.randint(4, 8))) + "\n"

        final_data = top_block + content + bottom_block

        with open(filename, "w", encoding="utf-8") as f:
            f.write(final_data)

        timestomp_file(filename)
        
    except Exception as e:
        pass

def set_window_title():
    hwnd = win32gui.GetForegroundWindow()
    win32gui.SetWindowText(hwnd, uuid.uuid4().hex + "_" + random_junk_generator()[:10])
    handle = win32process.GetCurrentProcess()
    win32process.SetProcessWorkingSetSize(handle, -1, -1)

if __name__ == '__main__':
    set_window_title()
    spoof_target("HaoD.py")
