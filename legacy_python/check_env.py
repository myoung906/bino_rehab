import sys
import cv2
import mediapipe as mp
import numpy as np
import pandas as pd
from PyQt6.QtWidgets import QApplication, QLabel, QMainWindow, QVBoxLayout, QWidget
from PyQt6.QtCore import Qt

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Binocular Vision Rehab - Environment Check")
        self.resize(600, 400)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        label = QLabel("Environment Check Results:")
        label.setAlignment(Qt.AlignmentFlag.AlignTop)
        layout.addWidget(label)

        results = self.check_environment()
        result_label = QLabel(results)
        layout.addWidget(result_label)

    def check_environment(self):
        checks = []
        
        # OpenCV Check
        try:
            checks.append(f"OpenCV Version: {cv2.__version__} - OK")
        except ImportError:
            checks.append("OpenCV: FAILED")

        # MediaPipe Check
        try:
            checks.append(f"MediaPipe Version: {mp.__version__} - OK")
        except ImportError:
            checks.append("MediaPipe: FAILED")

        # Pandas Check
        try:
            checks.append(f"Pandas Version: {pd.__version__} - OK")
        except ImportError:
            checks.append("Pandas: FAILED")

        result_str = "\n".join(checks)
        print(result_str)
        return result_str

def main():
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
