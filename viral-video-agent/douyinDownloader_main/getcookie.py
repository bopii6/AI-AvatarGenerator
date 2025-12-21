from pychrome import chrome
from pychrome.protocol import browser

def main():
    # 启动Chrome
    with chrome.Chrome() as chrome:
        # 连接到Chrome
        chrome = chrome.connect()

        # 启用Browser域
        browser_domain = browser.Domain(chrome)

        # 访问网站
        chrome.Page.enable()
        chrome.Tab.create(url="https://www.douyin.com")

        # 等待页面加载
        chrome.Page.navigate("https://www.douyin.com", 10000)

        # 获取cookie
        cookies = chrome.Network.get_cookies()
        print(cookies)

if __name__ == "__main__":
    main()