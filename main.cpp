#include <iostream>
#include <Windows.h>
#include <chrono>
#include <thread>

using namespace std;

int main() {


    cout << " ˵��:���¡�capslock�����Ը�����ת���ٴΰ���ֹͣ���ó���û��ע���ڴ棬������ \n Written by BlingCc";

    while (true) {
        if (GetKeyState(VK_CAPITAL) & 1) {
            mouse_event(MOUSEEVENTF_MOVE, 800, 0, 0, 0);
        }

        this_thread::sleep_for(chrono::milliseconds(1));
    }

}