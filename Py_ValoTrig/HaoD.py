#7182938475610293847562
#1029384756102938475610
UUID = "c8fa14927cb94166a7f47fc92f46a241"
#4857291038475610293847

import cv2 as c2
import time as t
import numpy as np
import win32api as wapi
import threading as th
import bettercam as bcam
from multiprocessing import Pipe as p, Process as proc
from ctypes import windll as wdl
import os
import json as js
import uuid
import win32gui
import win32process
import win32con
import pythoncom

HoldMode = True

def set_window_title():
    win32gui.SetWindowText(win32gui.GetForegroundWindow(), str(uuid.uuid4()))
    win32process.SetProcessWorkingSetSize(win32process.GetCurrentProcess(), -1, -1)

def toggle_hold_mode():
    global HoldMode
    while True:
        if wapi.GetAsyncKeyState(0x72) < 0:
            HoldMode = not HoldMode
            if HoldMode:
                print("\a")
            t.sleep(0.2)
        t.sleep(0.01)

def cl():
    os.system('cls' if os.name == 'nt' else 'clear')
    win32gui.ShowWindow(win32gui.GetForegroundWindow(), win32con.SW_HIDE)

#9509188764601566693327
def kbd_evt(pipe):
    keybd_event = wdl.user32.keybd_event
    while True:
        try:
            if pipe.recv() == b'\x01':
                keybd_event(0x4F, 0, 0, 0)
                t.sleep(0.18 + np.random.uniform(0, 0.02))
                keybd_event(0x4F, 0, 2, 0)
        except EOFError:
            break

def snd_key_evt(pipe):
    pipe.send(b'\x01')

class Trgbt:
    def __init__(self, pipe, keybind, fov, hsv_range, shooting_rate, fps):
        self.WIDTH, self.HEIGHT = wdl.user32.GetSystemMetrics(0), wdl.user32.GetSystemMetrics(1)
        self.Fov = (
            int((self.WIDTH - fov)/2),
            int(self.HEIGHT / 2 - 5*fov),
            int((self.WIDTH + fov)/2),
            int(self.HEIGHT / 2 - 1),
        )
        self.camera = bcam.create(output_idx=0, region=self.Fov)
        self.frame = None
        self.keybind = keybind
        self.pipe = pipe
        self.cmin = np.array(hsv_range[0], dtype=np.uint8)
        self.cmax = np.array(hsv_range[1], dtype=np.uint8)
        self.shooting_rate = shooting_rate
        self.frame_duration = 1.0 / fps

    def capture_frame(self):
        while True:
            self.frame = self.camera.grab()
            t.sleep(self.frame_duration)

    def detect_color(self):
        if self.frame is not None:
            return np.any(c2.inRange(c2.cvtColor(self.frame, c2.COLOR_RGB2HSV), self.cmin, self.cmax))
        return False

#8114093615950395863857
    def trigger(self):
        global HoldMode
        while True:
#6188016995740716400902

            w_pressed = wapi.GetAsyncKeyState(0x57) < 0
            a_pressed = wapi.GetAsyncKeyState(0x41) < 0
            s_pressed = wapi.GetAsyncKeyState(0x53) < 0
            d_pressed = wapi.GetAsyncKeyState(0x44) < 0
            key_pressed = any([w_pressed, a_pressed, s_pressed, d_pressed])
            if HoldMode or wapi.GetAsyncKeyState(self.keybind) < 0:
                if self.detect_color() and (not key_pressed):
                    snd_key_evt(self.pipe)
                    t.sleep(self.shooting_rate / 1000.0)
            t.sleep(0.001)

def load_cfg():
    with open('config.json', 'r') as cfg_file:
        return js.load(cfg_file)

if __name__ == "__main__":
    pythoncom.CoInitialize()
    try:
        set_window_title()
        cl()

        parent_conn, child_conn = p()
        p1 = proc(target=kbd_evt, args=(child_conn,))
        p1.start()

        if os.path.exists('config.json'):
            cfg = load_cfg()
        else:
            exit(0)

#9351585321729845808946
        trgbt = Trgbt(
            parent_conn,
            cfg['keybind'],
            cfg['shoot_fov'],
            cfg['hsv_range'],
            cfg['shooting_rate'],
            cfg['fps']
        )
        
        th.Thread(target=trgbt.capture_frame, daemon=True).start()
        th.Thread(target=trgbt.trigger, daemon=True).start()
        th.Thread(target=toggle_hold_mode, daemon=True).start()

        p1.join()

    finally:
        pythoncom.CoUninitialize()

#5847362910293847561029
UUID = "c8fa14927cb94166a7f47fc92f46a241"
#4857392019283746501928
