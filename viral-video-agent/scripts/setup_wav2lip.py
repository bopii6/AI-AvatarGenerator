import os
import subprocess
import sys

def install_package(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

def main():
    print("Starting Wav2Lip setup...")
    
    # 1. Clone Wav2Lip repository
    repo_url = "https://github.com/Rudrabha/Wav2Lip.git"
    target_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "services", "Wav2Lip")
    
    if not os.path.exists(target_dir):
        print(f"Cloning Wav2Lip to {target_dir}...")
        try:
            subprocess.check_call(["git", "clone", repo_url, target_dir])
        except subprocess.CalledProcessError as e:
            print(f"Failed to clone repository: {e}")
            return
    else:
        print("Wav2Lip repository already exists.")

    # 2. Install dependencies
    print("Installing dependencies...")
    requirements = [
        "librosa",  # Latest version for Py3.13
        "numpy", 
        "opencv-python", 
        "torch", 
        "torchvision", 
        "tqdm",
        "numba"     # Latest version
    ]
    
    for req in requirements:
        try:
            print(f"Installing {req}...")
            install_package(req)
        except Exception as e:
            print(f"Failed to install {req}: {e}")

    print("Setup complete!")

if __name__ == "__main__":
    main()
