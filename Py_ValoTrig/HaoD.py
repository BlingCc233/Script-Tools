#4961678295879605782389
#5658013188006130804710
#5087435813779326061950
#3606130809251733756865
#1436118890815839971612
# 2157177301179982704991
# 9772353426039453686997
# 4743621297241619295098
# 9773325648826413549435
# 3672767508568704047545
# 7510648642424731929408
# 6169349124380551461568
# 9332970030554314678513
import cv2 as c2
import time as t
import keyboard
import numpy as np
import ctypes as c
import win32api as wapi
import threading as th
import bettercam as bcam
from multiprocessing import Pipe as p, Process as proc
from ctypes import windll as wdl
import os as os
import json as js
import uuid

# 1325081847513289512310
import win32gui
import win32process
import win32con
import pythoncom
import mss

# UUID = "cd18cb52791c4549abc492ae0265dbdf"
# Number lines can be added here
# UUID = "cd18cb52791c4549abc492ae0265dbdf"

HoldMode = True
Counter_Strafe = True


def set_window_title():
    random_uuid = str(uuid.uuid4())
    current_pid = os.getpid()
    hwnd = win32gui.GetForegroundWindow()
    win32gui.SetWindowText(hwnd, random_uuid)
    handle = win32process.GetCurrentProcess()
    win32process.SetProcessWorkingSetSize(handle, -1, -1)


def toggle_hold_mode():
    global HoldMode
    while True:
        if wapi.GetAsyncKeyState(0x72) < 0:
            HoldMode = not HoldMode
            print("HoldMode", HoldMode)
            if HoldMode:
                print("\a")
            t.sleep(0.2)
        t.sleep(0.001)

def toggle_cs_mode():
    global Counter_Strafe
    while True:
        if wapi.GetAsyncKeyState(0x73) < 0:
            Counter_Strafe = not Counter_Strafe
            print("Counter_Strafe", Counter_Strafe)
            if Counter_Strafe:
                print("\a")
            t.sleep(0.2)
        t.sleep(0.001)


# Utility to clear the terminal
def cl():
    os.system('cls' if os.name == 'nt' else 'clear')
    console = win32gui.GetForegroundWindow()
    win32gui.ShowWindow(console, win32con.SW_HIDE)


# Function to simulate keyboard events
def kbd_evt(pipe):
    keybd_event = wdl.user32.keybd_event
    while True:
        try:
            key = pipe.recv()
            if key == b'\x01':
                keybd_event(0x4F, 0, 0, 0)  # O key press
                t.sleep(0.18 + np.random.uniform(0, 0.02))  # Sleep for 180~200ms
                keybd_event(0x4F, 0, 2, 0)  # O key release
        except EOFError:
            break

def PR_comp(pipe):
    """Process for sending counter-strafe key events."""
    keybd_event = wdl.user32.keybd_event
    mapping = {
        b'\x02': (0x27, 0),  # press RIGHT
        b'\x12': (0x27, 2),  # release RIGHT
        b'\x03': (0x25, 0),  # press LEFT
        b'\x13': (0x25, 2),  # release LEFT
        b'\x04': (0x26, 0),  # press UP
        b'\x14': (0x26, 2),  # release UP
        b'\x05': (0x28, 0),  # press DOWN
        b'\x15': (0x28, 2),  # release DOWN
    }
    while True:
        try:
            cmd = pipe.recv()
            if cmd in mapping:
                vk, flag = mapping[cmd]
                keybd_event(vk, 0, flag, 0)
        except EOFError:
            break

# Helper function to send key press
def snd_key_evt(pipe):       pipe.send(b'\x01')
def snd_counter_strafe_right(pipe): pipe.send(b'\x02')
def release_key_evt_right(pipe):    pipe.send(b'\x12')
def snd_counter_strafe_left(pipe):  pipe.send(b'\x03')
def release_key_evt_left(pipe):     pipe.send(b'\x13')
def snd_counter_strafe_up(pipe):    pipe.send(b'\x04')
def release_key_evt_up(pipe):       pipe.send(b'\x14')
def snd_counter_strafe_down(pipe):  pipe.send(b'\x05')
def release_key_evt_down(pipe):     pipe.send(b'\x15')


# UUID = "cd18cb52791c4549abc492ae0265dbdf"


# Triggerbot class that contains the main logic
class Trgbt:
    def __init__(self, pipe, keybind, fov, hsv_range, shooting_rate, fps, counter_strafe_fov):
        user32 = wdl.user32
        self.WIDTH, self.HEIGHT = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        self.size = fov
        self.Fov = (
            int((self.WIDTH - self.size)/2),
            int(self.HEIGHT / 2 - 7*self.size),
            int((self.WIDTH + self.size)/2),
            int(self.HEIGHT / 2 - 1),
        )
        x1 = int((self.WIDTH - self.size)/2)
        y1 = int(self.HEIGHT / 2 - 5*self.size)
        x2 = int((self.WIDTH + self.size)/2)
        y2 = int(self.HEIGHT / 2 - 1)
        left   = max(0, x1)
        top    = max(0, y1)
        width  = max(1, min(self.WIDTH - left, x2 - x1))
        height = max(1, min(self.HEIGHT - top, y2 - y1))
        self.aim_region = {
            "left":   left,
            "top":    top,
            "width":  width,
            "height": height,
        }
        self.camera = bcam.create(output_idx=0, region=self.Fov)
        x1 = int(self.WIDTH/2 - 3*counter_strafe_fov)
        y1 = int(self.HEIGHT/2 - 3*counter_strafe_fov)
        x2 = int(self.WIDTH/2 + 3*counter_strafe_fov)
        y2 = int(self.HEIGHT/2 + 3*counter_strafe_fov)
        left   = max(0, x1)
        top    = max(0, y1)
        width  = max(1, min(self.WIDTH - left, x2 - x1))
        height = max(1, min(self.HEIGHT - top, y2 - y1))
        self.cs_region = {
            "left":   left,
            "top":    top,
            "width":  width,
            "height": height,
        }
        self.cs_frame = None
        self.frame = None
        self.keybind = keybind
        self.pipe = pipe
        self.cmin, self.cmax = hsv_range
        self.shooting_rate = shooting_rate
        self.frame_duration = 1 / fps
        self.keys_pressed = False
        self.counter_strafing = {'w':False,'a':False,'s':False,'d':False}
        self.counter_strafing_lock = th.Lock()


    #7059588831561836230712
    def capture_frame(self):
        while True:
            self.frame = self.camera.grab()
            t.sleep(self.frame_duration)

    # def capture_frame(self):
    #     with mss.mss() as sct:
    #         while True:
    #             try:
    #                 img = sct.grab(self.cs_region)  # BGRA
    #             except Exception as e:
    #                 t.sleep(0.01)
    #                 continue
    #             arr = np.array(img)[:, :, :3]
    #             self.frame = arr
    #             t.sleep(self.frame_duration)

    #1081469173419837235314
    def detect_color(self):
        if self.frame is not None:
            hsv = c2.cvtColor(self.frame, c2.COLOR_RGB2HSV)

            # Convert HSV range to NumPy arrays if they're not already
            self.cmin = np.array(self.cmin, dtype=np.uint8)
            self.cmax = np.array(self.cmax, dtype=np.uint8)

            mask = c2.inRange(hsv, self.cmin, self.cmax)

            return np.any(mask)

    # def detect_color(self):
    #     if self.frame is None:
    #         return False
    #     hsv = c2.cvtColor(self.frame, c2.COLOR_BGR2HSV)
    #     cmin = np.array(self.cmin, dtype=np.uint8)
    #     cmax = np.array(self.cmax, dtype=np.uint8)
    #     mask = c2.inRange(hsv, cmin, cmax)
    #     return bool(mask.any())

    def capture_cs_frame(self):
        with mss.mss() as sct:
            while True:
                try:
                    img = sct.grab(self.cs_region)     # BGRA
                except Exception as e:
                    t.sleep(0.01)
                    continue
                arr = np.array(img)[:, :, :3]
                self.cs_frame = arr
                t.sleep(self.frame_duration)

    def detect_cs_color(self):
        if self.cs_frame is None:
            return False
        hsv = c2.cvtColor(self.cs_frame, c2.COLOR_BGR2HSV)
        cmin = np.array(self.cmin, dtype=np.uint8)
        cmax = np.array(self.cmax, dtype=np.uint8)
        mask = c2.inRange(hsv, cmin, cmax)
        return bool(mask.any())


    def counter_strafe(self):
        global Counter_Strafe

        def check_w():
            while True:
                w_pressed = wapi.GetAsyncKeyState(0x57) < 0
                down_pressed = wapi.GetAsyncKeyState(0x28) < 0
                if w_pressed and not down_pressed:
                    if self.detect_cs_color() and (Counter_Strafe or wapi.GetAsyncKeyState(self.keybind) < 0):
                                snd_counter_strafe_down(self.pipe)
                t.sleep(0.001)


        def check_s():
            while True:
                s_pressed = wapi.GetAsyncKeyState(0x53) < 0
                up_pressed = wapi.GetAsyncKeyState(0x26) < 0
                if s_pressed and not up_pressed:
                    if self.detect_cs_color() and (Counter_Strafe or wapi.GetAsyncKeyState(self.keybind) < 0):
                                snd_counter_strafe_up(self.pipe)
                t.sleep(0.001)


        def check_a():
            while True:
                a_pressed = wapi.GetAsyncKeyState(0x41) < 0
                right_pressed = wapi.GetAsyncKeyState(0x27) < 0
                if a_pressed and not right_pressed:
                    if self.detect_cs_color() and (Counter_Strafe or wapi.GetAsyncKeyState(self.keybind) < 0):
                                snd_counter_strafe_right(self.pipe)
                t.sleep(0.001)

        def check_d():
            while True:
                d_pressed = wapi.GetAsyncKeyState(0x44) < 0
                left_pressed = wapi.GetAsyncKeyState(0x25) < 0
                if d_pressed and not left_pressed:
                    if self.detect_cs_color() and (Counter_Strafe or wapi.GetAsyncKeyState(self.keybind) < 0):
                                snd_counter_strafe_left(self.pipe)
                t.sleep(0.001)

        th.Thread(target=check_w, daemon=True).start()
        th.Thread(target=check_s, daemon=True).start()
        th.Thread(target=check_a, daemon=True).start()
        th.Thread(target=check_d, daemon=True).start()

    def monitor_arrow_keys(self, pipe):
        arrow_keys = {
            0x25: (b'\x13', 0x44),  # left -> d
            0x26: (b'\x14', 0x53),  # up -> S
            0x27: (b'\x12', 0x41),  # right -> a
            0x28: (b'\x15', 0x57)   # down -> W
        }
        key_times = {code: 0.0 for code in arrow_keys}
        color_check_times = {code: 0.0 for code in arrow_keys}

        while True:
            for vk_code, (release_cmd, opposite_key) in arrow_keys.items():
                current_state = wapi.GetAsyncKeyState(vk_code) < 0
                opposite_pressed = wapi.GetAsyncKeyState(opposite_key) < 0

                if current_state:
                    if not opposite_pressed:
                        if key_times[vk_code] == 0.0:
                            key_times[vk_code] = t.time()
                        elif t.time() - key_times[vk_code] >= 0.02:
                            pipe.send(release_cmd)
                            # print('Key released by monitor - opposite key not pressed')
                            key_times[vk_code] = 0.0
                    elif opposite_pressed:
                        if not self.detect_cs_color():
                            if color_check_times[vk_code] == 0.0:
                                color_check_times[vk_code] = t.time()
                            elif t.time() - color_check_times[vk_code] >= 0.02:
                                pipe.send(release_cmd)
                                # print('Key released by monitor - no color detected')
                                color_check_times[vk_code] = 0.0
                        elif not color_check_times[vk_code] == 0.0 and t.time() - color_check_times[vk_code] >= 0.02:
                            pipe.send(release_cmd)
                            # print('Key released by monitor - no color detected')
                            color_check_times[vk_code] = 0.0
                        else:
                            color_check_times[vk_code] = 0.0
                else:
                    key_times[vk_code] = 0.0
                    color_check_times[vk_code] = 0.0
            t.sleep(0.001)

    def is_stable(self):
        w_pressed = wapi.GetAsyncKeyState(0x57) < 0
        a_pressed = wapi.GetAsyncKeyState(0x41) < 0
        s_pressed = wapi.GetAsyncKeyState(0x53) < 0
        d_pressed = wapi.GetAsyncKeyState(0x44) < 0
        up_pressed = wapi.GetAsyncKeyState(0x26) < 0
        down_pressed = wapi.GetAsyncKeyState(0x28) < 0
        left_pressed = wapi.GetAsyncKeyState(0x25) < 0
        right_pressed = wapi.GetAsyncKeyState(0x27) < 0

        opposite_pressed = (
            (w_pressed and down_pressed) or
            (s_pressed and up_pressed) or
            (a_pressed and right_pressed) or
            (d_pressed and left_pressed)
        )
        return opposite_pressed

    #1250399645114576184314
    def trigger(self):
        global HoldMode

        while True:
            #5327509531647931282962

            w_pressed = wapi.GetAsyncKeyState(0x57) < 0
            a_pressed = wapi.GetAsyncKeyState(0x41) < 0
            s_pressed = wapi.GetAsyncKeyState(0x53) < 0
            d_pressed = wapi.GetAsyncKeyState(0x44) < 0
            key_pressed = any([w_pressed, a_pressed, s_pressed, d_pressed])
            if (HoldMode or wapi.GetAsyncKeyState(self.keybind) < 0):
                if not key_pressed:
                    if self.detect_color():
                        snd_key_evt(self.pipe)
                        t.sleep(self.shooting_rate / 1000)
                else:
                    if (self.detect_color() and self.is_stable()):
                        snd_key_evt(self.pipe)
                        t.sleep(self.shooting_rate / 1000)
            t.sleep(0.001)


# Function to load the configuration from a file
def load_cfg():
    with open('config.json', 'r') as cfg_file:
        return js.load(cfg_file)


if __name__ == "__main__":
    pythoncom.CoInitialize()
    try:
        set_window_title()
        cl()

        #7772201228164039549551
        parent_conn, child_conn = p()
        p1 = proc(target=kbd_evt, args=(child_conn,))
        p2 = proc(target=PR_comp, args=(child_conn,))
        p1.start()
        p2.start()

        # Load or create the configuration
        cfg = {}
        if os.path.exists('config.json'):
            cfg = load_cfg()
            print("Config loaded:")
            print(js.dumps(cfg, indent=4))
        else:
            exit(0)

        # Initialize and start the Triggerbot
        trgbt = Trgbt(
            parent_conn,
            cfg['keybind'],
            cfg['shoot_fov'],
            cfg['hsv_range'],
            cfg['shooting_rate'],
            cfg['fps'],
            cfg['counter_strafe_fov'],
        )
        th.Thread(target=trgbt.capture_frame, daemon=True).start()
        th.Thread(target=trgbt.trigger, daemon=True).start()
        th.Thread(target=trgbt.capture_cs_frame, daemon=True).start()
        th.Thread(target=trgbt.counter_strafe, daemon=True).start()
        th.Thread(target=toggle_hold_mode, daemon=True).start()
        th.Thread(target=toggle_cs_mode, daemon=True).start()
        th.Thread(target=trgbt.monitor_arrow_keys, args=(parent_conn,), daemon=True).start()

        p1.join()
        p2.join()

    finally:
        pythoncom.CoUninitialize()


#3272998007079777629464
#5324533394133214610904
#2267161548092370328741
#8385797452554038038053
#7584258559495006655514
