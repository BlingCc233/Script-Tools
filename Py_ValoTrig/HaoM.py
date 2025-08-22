#7274707453798429610595
#8908022156605687570620
#1246560524840681399424
#6907985704820208138349
#9445803511319714708997
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

# UUID = "09ce89ba3e754ccbb8e0027f89a62bb7"
# Number lines can be added here
# UUID = "09ce89ba3e754ccbb8e0027f89a62bb7"

HoldMode = True


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
            elif key == b'\x02':  # D key PR
                keybd_event(0x44, 0, 0, 0)
                keybd_event(0x44, 0, 2, 0)
            elif key == b'\x03':  # A key PR
                keybd_event(0x41, 0, 0, 0)
                keybd_event(0x41, 0, 2, 0)
        except EOFError:
            break


# Helper function to send key press
def snd_key_evt(pipe):
    pipe.send(b'\x01')


def snd_counter_strafe_d(pipe):
    pipe.send(b'\x02')


def snd_counter_strafe_a(pipe):
    pipe.send(b'\x03')


# UUID = "09ce89ba3e754ccbb8e0027f89a62bb7"


# Triggerbot class that contains the main logic
class Trgbt:
    def __init__(self, pipe, keybind, fov, hsv_range, shooting_rate, fps):
        user32 = wdl.user32
        self.WIDTH, self.HEIGHT = user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)
        self.size = fov
        self.Fov = (
            int((self.WIDTH - self.size)/2),
            int(self.HEIGHT / 2 - 5*self.size),
            int((self.WIDTH + self.size)/2),
            int(self.HEIGHT / 2 - 1),
        )
        self.camera = bcam.create(output_idx=0, region=self.Fov)
        self.frame = None
        self.keybind = keybind
        self.pipe = pipe
        self.cmin, self.cmax = hsv_range
        self.shooting_rate = shooting_rate
        self.frame_duration = 1 / fps  # FPS to frame duration in seconds
        self.keys_pressed = False
        self.compensating = False

    # 3376531969297798834780
    def capture_frame(self):
        while True:
            self.frame = self.camera.grab()
            t.sleep(self.frame_duration)  # Sleep to control FPS

    # 1940164325752970134284
    def detect_color(self):
        if self.frame is not None:
            hsv = c2.cvtColor(self.frame, c2.COLOR_RGB2HSV)

            # Convert HSV range to NumPy arrays if they're not already
            self.cmin = np.array(self.cmin, dtype=np.uint8)
            self.cmax = np.array(self.cmax, dtype=np.uint8)

            mask = c2.inRange(hsv, self.cmin, self.cmax)

            # Ignore the center 6x6 area
            #center_x, center_y = mask.shape[1] // 2, mask.shape[0] // 2
            #mask[center_y - 3:center_y + 3, center_x - 3:center_x + 3] = 0

            return np.any(mask)

    # 4249558245055400016018
    def counter_strafe(self, key):
        if key == 'a' and not wapi.GetAsyncKeyState(0x44) < 0:  # Only if D is not pressed
            self.compensating = True
            snd_counter_strafe_d(self.pipe)
            t.sleep(0.005)
            self.compensating = False
        elif key == 'd' and not wapi.GetAsyncKeyState(0x41) < 0:  # Only if A is not pressed
            self.compensating = True
            snd_counter_strafe_a(self.pipe)
            t.sleep(0.005)
            self.compensating = False

    # 6612862375652859847857
    def setup_auto_counter_strafe(self):
        try:
            if not self.compensating:
                self.last_key_released = None

                def handle_a_release(e):
                    if not wapi.GetAsyncKeyState(0x44) < 0:  # If D is not pressed
                        th.Thread(target=self.counter_strafe, args=('a',)).start()

                def handle_d_release(e):
                    if not wapi.GetAsyncKeyState(0x41) < 0:  # If A is not pressed
                        th.Thread(target=self.counter_strafe, args=('d',)).start()

                keyboard.on_release_key('a', handle_a_release)
                keyboard.on_release_key('d', handle_d_release)
        except:
            pass

    # 2111152504080630427538
    def trigger(self):
        global HoldMode

        while True:
            if self.compensating:
                continue

            w_pressed = wapi.GetAsyncKeyState(0x57) < 0
            a_pressed = wapi.GetAsyncKeyState(0x41) < 0
            s_pressed = wapi.GetAsyncKeyState(0x53) < 0
            d_pressed = wapi.GetAsyncKeyState(0x44) < 0

            if w_pressed or a_pressed or s_pressed or d_pressed:
                self.keys_pressed = True
                continue
            elif self.keys_pressed:
                t.sleep(0.1)
                self.keys_pressed = False

            # 9040327190433994612105
            if (HoldMode or wapi.GetAsyncKeyState(self.keybind) < 0):
                if (self.detect_color()):
                    snd_key_evt(self.pipe)
                    t.sleep(self.shooting_rate / 1000)  # Convert ms to seconds
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

        # 8557499508750544242569
        parent_conn, child_conn = p()
        p_proc = proc(target=kbd_evt, args=(child_conn,))
        p_proc.start()

        # Load or create the configuration
        cfg = {}
        if os.path.exists('config.json'):
            cfg = load_cfg()
            print("Config loaded:")
            print(js.dumps(cfg, indent=4))
        else:
            exit(0)

        # Initialize and start the Triggerbot
        trgbt = Trgbt(parent_conn, cfg['keybind'], cfg['fov'], cfg['hsv_range'], cfg['shooting_rate'], cfg['fps'])
        th.Thread(target=trgbt.capture_frame).start()
        th.Thread(target=trgbt.trigger).start()
        th.Thread(target=trgbt.setup_auto_counter_strafe).start()
        th.Thread(target=toggle_hold_mode).start()
        p_proc.join()

    finally:
        pythoncom.CoUninitialize()

# 8861351893092589934794
# 4510105153634756731859
# 8270896064723636838480
# 5536517156515204770210
# 2008549174125769345780
# 3934425030227897189694
# 3492992698278267128020
# 1309464641736556925014
# 1093966859726169227691
#6665303920372519093915
#3754519225286879542461
#5108573549736682305215
#9995229128033918080001
#8733290643510830687873
