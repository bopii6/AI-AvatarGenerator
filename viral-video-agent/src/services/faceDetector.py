"""
人脸检测服务 - 使用 OpenCV
无需 InsightFace，纯 OpenCV 实现
"""

import cv2
import numpy as np
from typing import Tuple, List, Optional

class FaceDetector:
    """
    基于 OpenCV 的人脸检测器
    使用 Haar Cascade 分类器
    """
    
    def __init__(self):
        # 加载预训练的人脸检测模型
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        # 加载眼睛检测模型（用于更精确的人脸定位）
        self.eye_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_eye.xml'
        )
    
    def detect_face(self, image: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """
        检测图像中的人脸
        
        Args:
            image: BGR 格式的图像
            
        Returns:
            人脸边界框 (x, y, w, h) 或 None
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # 检测人脸
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(100, 100)
        )
        
        if len(faces) == 0:
            return None
        
        # 返回最大的人脸
        faces = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
        return tuple(faces[0])
    
    def detect_faces(self, image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """
        检测图像中的所有人脸
        
        Args:
            image: BGR 格式的图像
            
        Returns:
            人脸边界框列表 [(x, y, w, h), ...]
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(100, 100)
        )
        
        return [tuple(f) for f in faces]
    
    def extract_face(
        self, 
        image: np.ndarray, 
        padding: float = 0.2
    ) -> Optional[Tuple[np.ndarray, Tuple[int, int, int, int]]]:
        """
        提取人脸区域
        
        Args:
            image: BGR 格式的图像
            padding: 边距比例
            
        Returns:
            (人脸图像, 边界框) 或 None
        """
        bbox = self.detect_face(image)
        if bbox is None:
            return None
        
        x, y, w, h = bbox
        
        # 添加边距
        pad_w = int(w * padding)
        pad_h = int(h * padding)
        
        x1 = max(0, x - pad_w)
        y1 = max(0, y - pad_h)
        x2 = min(image.shape[1], x + w + pad_w)
        y2 = min(image.shape[0], y + h + pad_h)
        
        face_img = image[y1:y2, x1:x2]
        
        return face_img, (x1, y1, x2 - x1, y2 - y1)
    
    def get_face_landmarks(self, image: np.ndarray) -> Optional[dict]:
        """
        获取简化的人脸关键点（基于眼睛位置）
        
        注意：这是简化版本，不如 InsightFace 精确
        """
        bbox = self.detect_face(image)
        if bbox is None:
            return None
        
        x, y, w, h = bbox
        face_roi = image[y:y+h, x:x+w]
        gray_roi = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
        
        # 检测眼睛
        eyes = self.eye_cascade.detectMultiScale(gray_roi)
        
        if len(eyes) >= 2:
            # 按 x 坐标排序
            eyes = sorted(eyes, key=lambda e: e[0])
            left_eye = eyes[0]
            right_eye = eyes[-1]
            
            return {
                'left_eye': (x + left_eye[0] + left_eye[2]//2, 
                            y + left_eye[1] + left_eye[3]//2),
                'right_eye': (x + right_eye[0] + right_eye[2]//2,
                             y + right_eye[1] + right_eye[3]//2),
                'bbox': bbox,
            }
        
        return {'bbox': bbox}


def test_face_detection():
    """测试人脸检测"""
    detector = FaceDetector()
    
    # 创建测试图像
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("无法打开摄像头")
        return
    
    ret, frame = cap.read()
    cap.release()
    
    if ret:
        result = detector.extract_face(frame)
        if result:
            face, bbox = result
            print(f"检测到人脸: {bbox}")
            cv2.imwrite("test_face.jpg", face)
        else:
            print("未检测到人脸")


if __name__ == "__main__":
    test_face_detection()
