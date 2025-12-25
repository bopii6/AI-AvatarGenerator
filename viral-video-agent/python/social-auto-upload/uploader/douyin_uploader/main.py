# -*- coding: utf-8 -*-
from datetime import datetime

from playwright.async_api import Playwright, async_playwright, Page
import os
import asyncio
import re

from conf import LOCAL_CHROME_PATH, LOCAL_CHROME_HEADLESS
from utils.base_social_media import set_init_script
from utils.log import douyin_logger


async def _is_login_page(page: Page) -> bool:
    async def _any_visible(locator) -> bool:
        try:
            if await locator.count() == 0:
                return False
            return await locator.first.is_visible()
        except Exception:
            return False

    try:
        if await _any_visible(page.get_by_text('手机号登录')) or await _any_visible(page.get_by_text('扫码登录')):
            return True
    except Exception:
        pass
    try:
        # Some login variants do not show explicit "手机号登录/扫码登录" text, but do show phone/code inputs.
        if await _any_visible(page.get_by_placeholder('请输入手机号')) or await _any_visible(page.get_by_placeholder('请输入验证码')):
            return True
    except Exception:
        pass
    try:
        if await _any_visible(page.get_by_text(re.compile(r"(扫码.*登录|手机.*登录|验证码登录|登录抖音|抖音登录|立即登录)"))):
            return True
    except Exception:
        pass
    try:
        if await _any_visible(page.locator("input[name*='mobile'], input[placeholder*='手机号'], input[placeholder*='验证码'], input[name*='code']")):
            return True
    except Exception:
        pass
    try:
        # QR-code login often renders a canvas/image.
        if await _any_visible(page.locator("img[src*='qrcode'], canvas")):
            if await _any_visible(page.get_by_text(re.compile(r"(扫码|登录|验证)"))):
                return True
    except Exception:
        pass
    try:
        url = page.url or ""
        if "login" in url or "passport" in url:
            return True
    except Exception:
        pass
    return False


async def cookie_auth(account_file):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=LOCAL_CHROME_HEADLESS)
        context = await browser.new_context(storage_state=account_file)
        context = await set_init_script(context)
        # 创建一个新的页面
        page = await context.new_page()
        # 访问指定的 URL
        await page.goto("https://creator.douyin.com/creator-micro/content/upload")
        try:
            await page.wait_for_url("https://creator.douyin.com/creator-micro/content/upload", timeout=5000)
        except:
            print("[+] 等待5秒 cookie 失效")
            await context.close()
            await browser.close()
            return False
        # 2024.06.17 抖音创作者中心改版：用更稳健的可见性判断
        if await _is_login_page(page):
            print("[+] 等待5秒 cookie 失效")
            return False
        else:
            print("[+] cookie 有效")
            return True


async def douyin_setup(account_file, handle=False):
    if not os.path.exists(account_file) or not await cookie_auth(account_file):
        if not handle:
            # Todo alert message
            return False
        douyin_logger.info('[+] cookie文件不存在或已失效，即将自动打开浏览器，请扫码登录，登陆后会自动生成cookie文件')
        await douyin_cookie_gen(account_file)
    return True


async def douyin_cookie_gen(account_file):
    async with async_playwright() as playwright:
        options = {
            'headless': LOCAL_CHROME_HEADLESS
        }
        # Make sure to run headed.
        browser = await playwright.chromium.launch(**options)
        # Setup context however you like.
        context = await browser.new_context()  # Pass any options
        context = await set_init_script(context)
        # Pause the page, and start recording manually.
        page = await context.new_page()
        await page.goto("https://creator.douyin.com/")
        await page.pause()
        # 点击调试器的继续，保存cookie
        await context.storage_state(path=account_file)


class DouYinVideo(object):
    def __init__(self, title, file_path, tags, publish_date: datetime, account_file, thumbnail_path=None, productLink='', productTitle=''):
        self.title = title  # 视频标题
        self.file_path = file_path
        self.tags = tags
        self.publish_date = publish_date
        self.account_file = account_file
        self.date_format = '%Y年%m月%d日 %H:%M'
        self.local_executable_path = LOCAL_CHROME_PATH
        self.headless = LOCAL_CHROME_HEADLESS
        self.thumbnail_path = thumbnail_path
        self.productLink = productLink
        self.productTitle = productTitle

    async def set_schedule_time_douyin(self, page, publish_date):
        # 选择包含特定文本内容的 label 元素
        label_element = page.locator("[class^='radio']:has-text('定时发布')")
        # 在选中的 label 元素下点击 checkbox
        await label_element.click()
        await asyncio.sleep(1)
        publish_date_hour = publish_date.strftime("%Y-%m-%d %H:%M")

        await asyncio.sleep(1)
        await page.locator('.semi-input[placeholder="日期和时间"]').click()
        await page.keyboard.press("Control+KeyA")
        await page.keyboard.type(str(publish_date_hour))
        await page.keyboard.press("Enter")

        await asyncio.sleep(1)

    async def handle_upload_error(self, page):
        douyin_logger.info('视频出错了，重新上传中')
        await page.locator('div.progress-div [class^="upload-btn-input"]').set_input_files(self.file_path)

    async def upload(self, playwright: Playwright) -> None:
        # 使用 Chromium 浏览器启动一个浏览器实例
        # 核心诉求：登录弹窗要稳定、二维码不要被横向滚动条/缩放遮挡。
        # 与其依赖“最大化 + zoom 调整”，不如直接给 Playwright 一个固定 viewport：
        # - 强制窗口为 1500x900 + device scale factor 1，可覆盖 1080p/2K 屏。
        # - 不再调用 CDP setWindowBounds / 手动 zoom，减少页面闪烁。
        WINDOW_W, WINDOW_H = 1500, 900
        launch_args = ["--window-position=0,0"]
        if not self.headless:
            launch_args += [
                "--force-device-scale-factor=1",
                "--high-dpi-support=1",
                f"--window-size={WINDOW_W},{WINDOW_H}",
            ]
        if self.local_executable_path:
            browser = await playwright.chromium.launch(
                headless=self.headless,
                executable_path=self.local_executable_path,
                args=launch_args,
            )
        else:
            browser = await playwright.chromium.launch(headless=self.headless, args=launch_args)
        # 创建一个浏览器上下文，使用指定的 cookie 文件
        context_kwargs = {
            "storage_state": f"{self.account_file}",
            "viewport": {"width": WINDOW_W, "height": WINDOW_H},
            "screen": {"width": WINDOW_W, "height": WINDOW_H},
        }
        context = await browser.new_context(**context_kwargs)
        context = await set_init_script(context)

        # 创建一个新的页面
        page = await context.new_page()
        douyin_logger.info(f"[+] 浏览器窗口/viewport 已锁定为 {WINDOW_W}x{WINDOW_H}, headless={self.headless}")

        # 访问指定的 URL
        upload_url = "https://creator.douyin.com/creator-micro/content/upload"
        await page.goto(upload_url, wait_until="domcontentloaded")
        douyin_logger.info(f'[+]正在上传-------{self.title}.mp4')
        # 等待页面跳转到指定的 URL，没进入，则自动等待到超时
        douyin_logger.info(f'[-] 正在打开主页...')
        try:
            await page.wait_for_url(upload_url, timeout=15000)
        except Exception:
            pass
        await page.wait_for_load_state("domcontentloaded")

        async def _dump_debug(prefix: str, *, full_page: bool = False, capture_right: bool = False):
            try:
                os.makedirs("media", exist_ok=True)
                ts = int(datetime.now().timestamp())
                shot = os.path.join("media", f"{prefix}_{ts}.png")
                shot_right = os.path.join("media", f"{prefix}_{ts}_right.png")
                shot_viewport = os.path.join("media", f"{prefix}_{ts}_viewport.png")
                shot_right_viewport = os.path.join("media", f"{prefix}_{ts}_right_viewport.png")
                html = os.path.join("media", f"{prefix}_{ts}.html")
                meta = os.path.join("media", f"{prefix}_{ts}.txt")
                scroll_state = None

                # Save current scroll state so diagnostics won't disturb what user sees.
                try:
                    scroll_state = await page.evaluate(
                        """
                        () => {
                          const candidates = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
                          return candidates.map(el => ({
                            left: el.scrollLeft || 0,
                            top: el.scrollTop || 0,
                          }));
                        }
                        """
                    )
                except Exception:
                    scroll_state = None

                try:
                    # Give the page a moment to render; douyin login is a heavy SPA.
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(600)
                    if full_page:
                        await page.screenshot(path=shot, full_page=True)
                    else:
                        shot = ""
                    await page.screenshot(path=shot_viewport, full_page=False)
                except Exception:
                    shot = ""
                    shot_viewport = ""

                # Also capture the far-right view (OPTIONAL): this is useful for offline diagnosis,
                # but it will visibly scroll the page and may cause "flashing" during manual login.
                if capture_right:
                    try:
                        await page.evaluate(
                            """
                            () => {
                              const candidates = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
                              for (const el of candidates) {
                                try { el.scrollLeft = el.scrollWidth; } catch (e) {}
                                try { el.scrollTo({ left: el.scrollWidth, behavior: 'instant' }); } catch (e) {}
                              }
                            }
                            """
                        )
                        await page.wait_for_timeout(350)
                        if full_page:
                            await page.screenshot(path=shot_right, full_page=True)
                        else:
                            shot_right = ""
                        await page.screenshot(path=shot_right_viewport, full_page=False)
                    except Exception:
                        shot_right = ""
                        shot_right_viewport = ""
                    finally:
                        try:
                            if isinstance(scroll_state, list) and scroll_state:
                                await page.evaluate(
                                    """
                                    (state) => {
                                      const candidates = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
                                      for (let i = 0; i < candidates.length && i < state.length; i++) {
                                        const el = candidates[i];
                                        const s = state[i] || {};
                                        const left = Number(s.left || 0);
                                        const top = Number(s.top || 0);
                                        try { el.scrollTo({ left, top, behavior: 'instant' }); } catch (e) {
                                          try { el.scrollLeft = left; } catch (e2) {}
                                          try { el.scrollTop = top; } catch (e2) {}
                                        }
                                      }
                                    }
                                    """,
                                    scroll_state,
                                )
                                await page.wait_for_timeout(120)
                        except Exception:
                            pass
                else:
                    shot_right = ""
                    shot_right_viewport = ""
                try:
                    content = await page.content()
                    with open(html, "w", encoding="utf-8") as f:
                        f.write(content)
                except Exception:
                    html = ""
                try:
                    title = await page.title()
                except Exception:
                    title = ""
                try:
                    url = page.url or ""
                except Exception:
                    url = ""
                try:
                    info = await page.evaluate(
                        """
                        () => {
                          const el = document.scrollingElement || document.documentElement;
                          const overlay = document.getElementById('__vva_qr_overlay');
                          const state = document.getElementById('__vva_qr_state');
                          const r = overlay ? overlay.getBoundingClientRect() : null;
                          return {
                            innerWidth: window.innerWidth,
                            innerHeight: window.innerHeight,
                            dpr: window.devicePixelRatio,
                            scrollLeft: el ? el.scrollLeft : null,
                            scrollWidth: el ? el.scrollWidth : null,
                            scrollTop: el ? el.scrollTop : null,
                            scrollHeight: el ? el.scrollHeight : null,
                            overlayPresent: !!overlay,
                            overlayRect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null,
                            overlayState: state ? (state.textContent || '') : null,
                          };
                        }
                        """
                    )
                except Exception:
                    info = {}
                with open(meta, "w", encoding="utf-8") as f:
                    f.write(f"url={url}\n")
                    f.write(f"title={title}\n")
                    f.write(f"headless={self.headless}\n")
                    if isinstance(info, dict):
                        for k, v in info.items():
                            f.write(f"{k}={v}\n")
                douyin_logger.error(
                    f"[debug] 已保存诊断文件: {meta} {shot} {shot_viewport} {shot_right} {shot_right_viewport} {html}"
                )
            except Exception:
                pass

        async def _page_has_text(pattern: "str | re.Pattern") -> bool:
            try:
                return bool(await page.get_by_text(pattern).count())
            except Exception:
                return False

        async def _wait_for_upload_ui(total_timeout_sec: int = 90):
            """
            Douyin upload page is a heavy SPA. After login it may show a long loading screen / browser-check overlay.
            Don't fail fast; wait until upload input appears.
            """
            started = asyncio.get_event_loop().time()
            last_reload_at = started
            while (asyncio.get_event_loop().time() - started) < total_timeout_sec:
                # If we got redirected to login again, stop waiting here.
                if await _is_login_page(page):
                    return

                # Some obvious "blocked/unsupported browser" hints.
                if await _page_has_text(re.compile(r"(浏览器.*版本过低|浏览器不支持|请使用.*Chrome|请使用.*Edge|请升级浏览器|当前浏览器.*不支持)")):
                    await _dump_debug("douyin_browser_blocked")
                    raise RuntimeError("抖音创作者中心提示浏览器不支持/被拦截：请用 Chrome/Edge 正常打开创作者中心确认可进入上传页后再重试。")

                # Try to locate upload input.
                file_input = await find_file_input(page)
                if file_input:
                    return file_input

                # Sometimes the upload input is inside iframes.
                for frame in page.frames:
                    try:
                        if frame == page.main_frame:
                            continue
                        loc = frame.locator("input[type='file']")
                        if await loc.count():
                            return loc.first
                    except Exception:
                        continue

                # If page is stuck in "loading", give it time; occasionally reload once.
                now = asyncio.get_event_loop().time()
                if now - last_reload_at > 30:
                    last_reload_at = now
                    try:
                        await page.reload(wait_until="domcontentloaded")
                    except Exception:
                        pass

                await asyncio.sleep(1)

            await _dump_debug("douyin_upload_timeout")
            raise RuntimeError("抖音上传页加载超时：一直未出现上传控件（可能被风控/脚本未加载）。已保存诊断文件到 media 目录。")

        async def _wait_for_manual_login(timeout_sec: int = 120) -> bool:
            if self.headless:
                return False
            douyin_logger.warning(f"[!] 检测到登录页，等待你扫码/登录（最多 {timeout_sec}s），登录成功后将继续上传...")

            # 尽量把用户固定在“登录页”本身，避免 upload 页里登录弹层/跳转导致页面闪跳。
            try:
                login_url = "https://creator.douyin.com/login"
                url = page.url or ""
                if "login" not in url and "passport" not in url:
                    await page.goto(login_url, wait_until="domcontentloaded")
                    await page.wait_for_load_state("domcontentloaded")
            except Exception:
                pass
            try:
                await page.bring_to_front()
            except Exception:
                pass

            async def _install_qr_overlay() -> bool:
                """
                关键兜底：在登录页强制生成一个“固定在左上角”的二维码浮层。
                这样就算页面因为 DPI/窗口尺寸导致二维码卡片被挤到右侧、需要横向滚动条，用户也能直接扫到码。

                返回 True 表示已成功找到二维码并渲染到浮层；False 表示暂未找到（可能需要切换到“扫码登录”tab）。
                """
                try:
                    return bool(
                        await page.evaluate(
                            """
                            () => {
                              const OVERLAY_ID = '__vva_qr_overlay';
                              const IMG_ID = '__vva_qr_img';
                              const STATE_ID = '__vva_qr_state';

                              const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

                              const findQrSource = () => {
                                // 1) img 的二维码（有时是 data: 或带 qrcode 关键字）
                                const imgs = Array.from(document.querySelectorAll('img'))
                                  .filter(img => {
                                    try {
                                      const r = img.getBoundingClientRect();
                                      const w = r.width || img.naturalWidth || 0;
                                      const h = r.height || img.naturalHeight || 0;
                                      if (w < 60 || h < 60 || w > 520 || h > 520) return false;
                                      const src = (img.currentSrc || img.src || '').toLowerCase();
                                      const alt = (img.getAttribute('alt') || '').toLowerCase();
                                      return src.includes('qrcode') || src.startsWith('data:image') || alt.includes('二维码') || alt.includes('qr');
                                    } catch (e) { return false; }
                                  });
                                if (imgs.length) {
                                  const img = imgs[0];
                                  return { kind: 'img', src: img.currentSrc || img.src || '' };
                                }

                                // 2) canvas 的二维码（抖音登录常见）
                                const canvases = Array.from(document.querySelectorAll('canvas'))
                                  .filter(c => {
                                    try {
                                      const r = c.getBoundingClientRect();
                                      const w = r.width || c.width || 0;
                                      const h = r.height || c.height || 0;
                                      return w >= 60 && h >= 60 && w <= 520 && h <= 520;
                                    } catch (e) { return false; }
                                  });
                                if (canvases.length) {
                                  const canvas = canvases[0];
                                  let src = '';
                                  try { src = canvas.toDataURL('image/png'); } catch (e) { src = ''; }
                                  return { kind: 'canvas', src };
                                }

                                return null;
                              };

                              const ensureOverlay = () => {
                                let overlay = document.getElementById(OVERLAY_ID);
                                if (!overlay) {
                                  overlay = document.createElement('div');
                                  overlay.id = OVERLAY_ID;
                                  overlay.style.cssText = [
                                    'position:fixed',
                                    'top:12px',
                                    'left:12px',
                                    'z-index:2147483647',
                                    'background:rgba(255,255,255,0.96)',
                                    'border:1px solid rgba(0,0,0,0.08)',
                                    'border-radius:10px',
                                    'box-shadow:0 8px 30px rgba(0,0,0,0.18)',
                                    'padding:10px',
                                    'width:340px',
                                    'font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Noto Sans\", \"PingFang SC\", \"Microsoft YaHei\"',
                                    'color:#111',
                                  ].join(';');

                                  const title = document.createElement('div');
                                  title.textContent = '抖音扫码登录（浮层）';
                                  title.style.cssText = 'font-weight:700;font-size:14px;margin:0 0 6px 0;';

                                  const hint = document.createElement('div');
                                  hint.textContent = '如果主页面二维码被遮挡/需要横向滚动条，请直接扫这个浮层二维码。';
                                  hint.style.cssText = 'font-size:12px;line-height:16px;color:#444;margin:0 0 8px 0;';

                                  const img = document.createElement('img');
                                  img.id = IMG_ID;
                                  img.alt = 'douyin-qr';
                                  img.style.cssText = 'display:block;width:320px;height:320px;object-fit:contain;background:#fff;border-radius:8px;border:1px solid rgba(0,0,0,0.06);';

                                  const state = document.createElement('div');
                                  state.id = STATE_ID;
                                  state.style.cssText = 'font-size:12px;color:#666;margin-top:6px;';
                                  state.textContent = '正在加载二维码…';

                                  const close = document.createElement('button');
                                  close.textContent = '关闭浮层';
                                  close.type = 'button';
                                  close.style.cssText = 'position:absolute;top:8px;right:8px;border:0;background:#f3f4f6;color:#111;border-radius:8px;padding:4px 8px;cursor:pointer;font-size:12px;';
                                  close.onclick = () => {
                                    try {
                                      const timer = Number(overlay.dataset.timer || '0');
                                      if (timer) clearInterval(timer);
                                    } catch (e) {}
                                    overlay.remove();
                                  };

                                  overlay.appendChild(title);
                                  overlay.appendChild(hint);
                                  overlay.appendChild(img);
                                  overlay.appendChild(state);
                                  overlay.appendChild(close);
                                  document.documentElement.appendChild(overlay);
                                }
                                return overlay;
                              };

                              const overlay = ensureOverlay();

                              const update = () => {
                                const found = findQrSource();
                                const img = document.getElementById(IMG_ID);
                                const state = document.getElementById(STATE_ID);
                                if (!img || !state) return false;

                                if (!found || !found.src) {
                                  state.textContent = '未找到二维码元素（可能需要切到“扫码登录”）。';
                                  return false;
                                }
                                if (img.getAttribute('src') !== found.src) {
                                  img.setAttribute('src', found.src);
                                }
                                state.textContent = '二维码已就绪，请扫码登录。';
                                return true;
                              };

                              // 先更新一次
                              const ok = update();

                              // 定时刷新（canvas 可能会更新），避免用户看到旧码/空白
                              try {
                                const oldTimer = Number(overlay.dataset.timer || '0');
                                if (oldTimer) clearInterval(oldTimer);
                              } catch (e) {}
                              const timer = window.setInterval(update, 800);
                              overlay.dataset.timer = String(timer);

                              // 防止缩放/DPI 导致用户看不到浮层：强制确保浮层在视口内
                              try {
                                const r = overlay.getBoundingClientRect();
                                if (r.left < 0 || r.top < 0) {
                                  overlay.style.left = '12px';
                                  overlay.style.top = '12px';
                                }
                              } catch (e) {}

                              return ok;
                            }
                            """
                        )
                    )
                except Exception:
                    return False

            # 等待页面加载，然后直接定位二维码/登录卡片并滚动到可见区域
            try:
                await page.wait_for_load_state("domcontentloaded")
                await page.wait_for_timeout(1500)  # 等待页面渲染完成
                # 最重要：安装二维码浮层（不依赖页面布局/横向滚动条）
                overlay_ok = await _install_qr_overlay()

                # 尝试多种选择器定位二维码或登录卡片
                qr_selectors = [
                    "img[src*='qrcode']",  # 二维码图片
                    "canvas",  # 二维码可能是 canvas
                    "[class*='qr']",  # 含有 qr 的类名
                    "[class*='login-card']",  # 登录卡片
                    "[class*='scan']",  # 扫码相关
                    "text=扫码登录",  # 扫码登录文本
                ]
                # 不要在登录阶段做 scroll_into_view / 横向滚动：
                # - 抖音登录页经常是“左侧大背景 + 右侧二维码卡片”，横向滚动会导致页面来回跳动
                # - 我们已经用二维码浮层固定显示二维码（左上角），滚动反而会让用户更难扫码

                if not overlay_ok:
                    # 很多时候需要手动/自动切换到“扫码登录”tab 才会出现二维码
                    try:
                        tab = page.get_by_text(re.compile(r"^扫码登录$")).first
                        if await tab.count() and await tab.is_visible():
                            await tab.click()
                            await page.wait_for_timeout(600)
                            await _install_qr_overlay()
                    except Exception:
                        pass
            except Exception as e:
                douyin_logger.warning(f"[!] 尝试滚动到二维码失败: {e}")

            # 已经有固定 viewport + 二维码浮层，不再做任何“横向滚动”尝试，
            # 只在后台保存诊断截图，方便排查是否真的没有二维码。
            try:
                await _dump_debug("douyin_login_view")
            except Exception:
                pass

            started = asyncio.get_event_loop().time()
            # 不要在等待期间频繁滚动/点 tab（会造成“闪跳”），只在页面 URL 发生变化时做一次轻量校正。
            last_url = ""
            adjusted_for_url = 0.0
            while (asyncio.get_event_loop().time() - started) < timeout_sec:
                try:
                    if page.is_closed():
                        raise RuntimeError("page closed")
                except Exception:
                    raise
                try:
                    if not await _is_login_page(page):
                        return True
                except Exception:
                    pass
                try:
                    current_url = page.url or ""
                except Exception:
                    current_url = ""
                if current_url and current_url != last_url:
                    last_url = current_url
                    now = asyncio.get_event_loop().time()
                    if now - adjusted_for_url >= 2:
                        adjusted_for_url = now
                        try:
                            # URL 变化时，补一次浮层刷新（有时登录页会热更新/切换）
                            await _install_qr_overlay()
                            await _dump_debug("douyin_login_view")
                        except Exception:
                            pass
                await asyncio.sleep(1)
            return False

        # 若 cookie 失效会停留在登录页（URL 可能仍是 upload）。这里不要秒退：给用户扫码时间
        if await _is_login_page(page):
            ok = await _wait_for_manual_login()
            if ok:
                try:
                    # 登录完成后移除二维码浮层，避免挡住后续上传 UI
                    try:
                        await page.evaluate(
                            """
                            () => {
                              try {
                                const overlay = document.getElementById('__vva_qr_overlay');
                                if (overlay) {
                                  const timer = Number(overlay.dataset.timer || '0');
                                  if (timer) clearInterval(timer);
                                  overlay.remove();
                                }
                              } catch (e) {}
                            }
                            """
                        )
                    except Exception:
                        pass
                    # 登录后强制回到上传页，避免停留在中间页
                    await page.goto(upload_url, wait_until="domcontentloaded")
                    try:
                        await page.wait_for_url(upload_url, timeout=15000)
                    except Exception:
                        pass
                    try:
                        await page.wait_for_load_state("networkidle", timeout=30000)
                    except Exception:
                        pass
                    await context.storage_state(path=f"{self.account_file}")
                    douyin_logger.info("[+] 登录成功，已更新 storage_state（Cookie）文件")
                except Exception:
                    pass
            else:
                try:
                    await _dump_debug("douyin_login_required")
                except Exception:
                    pass
                raise RuntimeError("抖音 Cookie 可能已失效/未登录：请在应用内重新保存该账号 Cookie 后再发布（或确保当前弹出的登录页完成扫码登录）。")

        # 上传视频：抖音页面结构经常变化，这里做多套 selector + frame 兜底
        async def find_file_input(p: Page):
            selectors = [
                "input[type='file']",
                "input[type='file'][accept*='video']",
                "div.progress-div input[type='file']",
                "div.progress-div [class^='upload-btn-input']",
                "[class^='upload-btn-input']",
            ]
            for sel in selectors:
                loc = p.locator(sel)
                try:
                    if await loc.count():
                        return loc.first
                except Exception:
                    continue
            return None

        file_input = await _wait_for_upload_ui(total_timeout_sec=90)

        if not file_input:
            # 有时会被登录/风控页拦截，表现为找不到上传控件，但页面实际上是登录页
            if await _is_login_page(page):
                ok = await _wait_for_manual_login()
                if ok:
                    try:
                        await page.goto(upload_url, wait_until="domcontentloaded")
                        try:
                            await page.wait_for_url(upload_url, timeout=15000)
                        except Exception:
                            pass
                        await context.storage_state(path=f"{self.account_file}")
                        douyin_logger.info("[+] 登录成功，已更新 storage_state（Cookie）文件")
                    except Exception:
                        pass

                    file_input = await _wait_for_upload_ui(total_timeout_sec=90)

        # Some Douyin variants use a native file chooser triggered by a button click, and the <input type=file>
        # may be created dynamically (or hidden in shadow DOM). Use filechooser as fallback.
        async def upload_via_filechooser() -> bool:
            try:
                candidates = [
                    page.get_by_role('button', name=re.compile(r'上传视频')),
                    page.get_by_text(re.compile(r'^上传视频$')),
                    page.get_by_text(re.compile(r'点击上传')),
                    page.get_by_text(re.compile(r'拖拽视频文件')),
                ]
                btn = None
                for c in candidates:
                    try:
                        if await c.count() and await c.first.is_visible():
                            btn = c.first
                            break
                    except Exception:
                        continue
                if not btn:
                    return False

                async with page.expect_file_chooser(timeout=15000) as fc_info:
                    await btn.click()
                fc = await fc_info.value
                await fc.set_files(self.file_path)
                douyin_logger.info("  [-] 通过文件选择器已选择视频文件，开始上传...")
                return True
            except Exception:
                return False

        if not file_input:
            # Upload UI may not expose an <input type=file> until you click the upload button.
            ok = await upload_via_filechooser()
            if not ok:
                # Last attempt: hard-refresh and try again once (SPA may be stuck).
                try:
                    await page.goto(upload_url, wait_until="domcontentloaded")
                except Exception:
                    pass
                ok = await upload_via_filechooser()
            if not ok:
                await _dump_debug("douyin_upload_missing")
                raise RuntimeError("未找到抖音上传控件（input[type=file] / 文件选择器 等），可能页面结构变更、被风控拦截、或未成功进入发布页。请确认 Cookie 有效并可进入创作者中心上传页。")
        else:
            try:
                await file_input.set_input_files(self.file_path)
            except Exception:
                ok = await upload_via_filechooser()
                if not ok:
                    await _dump_debug("douyin_set_input_files_failed")
                    raise

        # 等待页面跳转到指定的 URL 2025.01.08修改在原有基础上兼容两种页面
        while True:
            try:
                # 尝试等待第一个 URL
                await page.wait_for_url(
                    "https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page", timeout=3000)
                douyin_logger.info("[+] 成功进入version_1发布页面!")
                break  # 成功进入页面后跳出循环
            except Exception:
                try:
                    # 如果第一个 URL 超时，再尝试等待第二个 URL
                    await page.wait_for_url(
                        "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page",
                        timeout=3000)
                    douyin_logger.info("[+] 成功进入version_2发布页面!")

                    break  # 成功进入页面后跳出循环
                except:
                    print("  [-] 超时未进入视频发布页面，重新尝试...")
                    await asyncio.sleep(0.5)  # 等待 0.5 秒后重新尝试
        # 填充标题和话题
        # 检查是否存在包含输入框的元素
        # 这里为了避免页面变化，故使用相对位置定位：作品标题父级右侧第一个元素的input子元素
        await asyncio.sleep(1)
        douyin_logger.info(f'  [-] 正在填充标题和话题...')
        title_container = page.get_by_text('作品标题').locator("..").locator("xpath=following-sibling::div[1]").locator("input")
        if await title_container.count():
            await title_container.fill(self.title[:30])
        else:
            titlecontainer = page.locator(".notranslate")
            await titlecontainer.click()
            await page.keyboard.press("Backspace")
            await page.keyboard.press("Control+KeyA")
            await page.keyboard.press("Delete")
            await page.keyboard.type(self.title)
            await page.keyboard.press("Enter")
        css_selector = ".zone-container"
        for index, tag in enumerate(self.tags, start=1):
            await page.type(css_selector, "#" + tag)
            await page.press(css_selector, "Space")
        douyin_logger.info(f'总共添加{len(self.tags)}个话题')
        while True:
            # 判断重新上传按钮是否存在，如果不存在，代表视频正在上传，则等待
            try:
                #  新版：定位重新上传
                number = await page.locator('[class^="long-card"] div:has-text("重新上传")').count()
                if number > 0:
                    douyin_logger.success("  [-]视频上传完毕")
                    break
                else:
                    douyin_logger.info("  [-] 正在上传视频中...")
                    await asyncio.sleep(2)

                    if await page.locator('div.progress-div > div:has-text("上传失败")').count():
                        douyin_logger.error("  [-] 发现上传出错了... 准备重试")
                        await self.handle_upload_error(page)
            except:
                douyin_logger.info("  [-] 正在上传视频中...")
                await asyncio.sleep(2)

        if self.productLink and self.productTitle:
            douyin_logger.info(f'  [-] 正在设置商品链接...')
            await self.set_product_link(page, self.productLink, self.productTitle)
            douyin_logger.info(f'  [+] 完成设置商品链接...')
        
        #上传视频封面
        await self.set_thumbnail(page, self.thumbnail_path)

        # 更换可见元素
        await self.set_location(page, "")


        # 頭條/西瓜
        third_part_element = '[class^="info"] > [class^="first-part"] div div.semi-switch'
        # 定位是否有第三方平台
        if await page.locator(third_part_element).count():
            # 检测是否是已选中状态
            if 'semi-switch-checked' not in await page.eval_on_selector(third_part_element, 'div => div.className'):
                await page.locator(third_part_element).locator('input.semi-switch-native-control').click()

        if self.publish_date != 0:
            await self.set_schedule_time_douyin(page, self.publish_date)

        # 判断视频是否发布成功
        published_ok = False
        while True:
            # 判断视频是否发布成功
            try:
                publish_button = page.get_by_role('button', name="发布", exact=True)
                if await publish_button.count():
                    await publish_button.click()
                await page.wait_for_url("https://creator.douyin.com/creator-micro/content/manage**",
                                        timeout=3000)  # 如果自动跳转到作品页面，则代表发布成功
                douyin_logger.success("  [-]视频发布成功")
                published_ok = True
                break
            except:
                # 尝试处理封面问题
                await self.handle_auto_video_cover(page)
                douyin_logger.info("  [-] 视频正在发布中...")
                await page.screenshot(full_page=True)
                await asyncio.sleep(0.5)

        try:
            await context.storage_state(path=self.account_file)  # 保存cookie
            douyin_logger.success('  [-]cookie更新完毕！')
        except Exception:
            if published_ok:
                douyin_logger.warning("  [!] 视频已发布，但 cookie 更新失败（你可能手动关闭了窗口/页面被刷新）。可忽略该提示。")
            else:
                raise
        await asyncio.sleep(2)  # 这里延迟是为了方便眼睛直观的观看
        # 关闭浏览器上下文和浏览器实例
        try:
            await context.close()
        except Exception:
            pass
        try:
            await browser.close()
        except Exception:
            pass

    async def handle_auto_video_cover(self, page):
        """
        处理必须设置封面的情况，点击推荐封面的第一个
        """
        # 1. 判断是否出现 "请设置封面后再发布" 的提示
        # 必须确保提示是可见的 (is_visible)，因为 DOM 中可能存在隐藏的历史提示
        if await page.get_by_text("请设置封面后再发布").first.is_visible():
            print("  [-] 检测到需要设置封面提示...")

            # 2. 定位“智能推荐封面”区域下的第一个封面
            # 使用 class^= 前缀匹配，避免 hash 变化导致失效
            recommend_cover = page.locator('[class^="recommendCover-"]').first

            if await recommend_cover.count():
                print("  [-] 正在选择第一个推荐封面...")
                try:
                    await recommend_cover.click()
                    await asyncio.sleep(1)  # 等待选中生效

                    # 3. 处理可能的确认弹窗 "是否确认应用此封面？"
                    # 并不一定每次都会出现，健壮性判断：如果出现弹窗，则点击确定
                    confirm_text = "是否确认应用此封面？"
                    if await page.get_by_text(confirm_text).first.is_visible():
                        print(f"  [-] 检测到确认弹窗: {confirm_text}")
                        # 直接点击“确定”按钮，不依赖脆弱的 CSS 类名
                        await page.get_by_role("button", name="确定").click()
                        print("  [-] 已点击确认应用封面")
                        await asyncio.sleep(1)

                    print("  [-] 已完成封面选择流程")
                    return True
                except Exception as e:
                    print(f"  [-] 选择封面失败: {e}")

        return False

    async def set_thumbnail(self, page: Page, thumbnail_path: str):
        if thumbnail_path:
            douyin_logger.info('  [-] 正在设置视频封面...')
            await page.click('text="选择封面"')
            await page.wait_for_selector("div.dy-creator-content-modal")
            await page.click('text="设置竖封面"')
            await page.wait_for_timeout(2000)  # 等待2秒
            # 定位到上传区域并点击
            await page.locator("div[class^='semi-upload upload'] >> input.semi-upload-hidden-input").set_input_files(thumbnail_path)
            await page.wait_for_timeout(2000)  # 等待2秒
            await page.locator("div#tooltip-container button:visible:has-text('完成')").click()
            # finish_confirm_element = page.locator("div[class^='confirmBtn'] >> div:has-text('完成')")
            # if await finish_confirm_element.count():
            #     await finish_confirm_element.click()
            # await page.locator("div[class^='footer'] button:has-text('完成')").click()
            douyin_logger.info('  [+] 视频封面设置完成！')
            # 等待封面设置对话框关闭
            await page.wait_for_selector("div.extractFooter", state='detached')
            

    async def set_location(self, page: Page, location: str = ""):
        if not location:
            return
        # todo supoort location later
        # await page.get_by_text('添加标签').locator("..").locator("..").locator("xpath=following-sibling::div").locator(
        #     "div.semi-select-single").nth(0).click()
        await page.locator('div.semi-select span:has-text("输入地理位置")').click()
        await page.keyboard.press("Backspace")
        await page.wait_for_timeout(2000)
        await page.keyboard.type(location)
        await page.wait_for_selector('div[role="listbox"] [role="option"]', timeout=5000)
        await page.locator('div[role="listbox"] [role="option"]').first.click()

    async def handle_product_dialog(self, page: Page, product_title: str):
        """处理商品编辑弹窗"""

        await page.wait_for_timeout(2000)
        await page.wait_for_selector('input[placeholder="请输入商品短标题"]', timeout=10000)
        short_title_input = page.locator('input[placeholder="请输入商品短标题"]')
        if not await short_title_input.count():
            douyin_logger.error("[-] 未找到商品短标题输入框")
            return False
        product_title = product_title[:10]
        await short_title_input.fill(product_title)
        # 等待一下让界面响应
        await page.wait_for_timeout(1000)

        finish_button = page.locator('button:has-text("完成编辑")')
        if 'disabled' not in await finish_button.get_attribute('class'):
            await finish_button.click()
            douyin_logger.debug("[+] 成功点击'完成编辑'按钮")
            
            # 等待对话框关闭
            await page.wait_for_selector('.semi-modal-content', state='hidden', timeout=5000)
            return True
        else:
            douyin_logger.error("[-] '完成编辑'按钮处于禁用状态，尝试直接关闭对话框")
            # 如果按钮禁用，尝试点击取消或关闭按钮
            cancel_button = page.locator('button:has-text("取消")')
            if await cancel_button.count():
                await cancel_button.click()
            else:
                # 点击右上角的关闭按钮
                close_button = page.locator('.semi-modal-close')
                await close_button.click()
            
            await page.wait_for_selector('.semi-modal-content', state='hidden', timeout=5000)
            return False
        
    async def set_product_link(self, page: Page, product_link: str, product_title: str):
        """设置商品链接功能"""
        await page.wait_for_timeout(2000)  # 等待2秒
        try:
            # 定位"添加标签"文本，然后向上导航到容器，再找到下拉框
            await page.wait_for_selector('text=添加标签', timeout=10000)
            dropdown = page.get_by_text('添加标签').locator("..").locator("..").locator("..").locator(".semi-select").first
            if not await dropdown.count():
                douyin_logger.error("[-] 未找到标签下拉框")
                return False
            douyin_logger.debug("[-] 找到标签下拉框，准备选择'购物车'")
            await dropdown.click()
            ## 等待下拉选项出现
            await page.wait_for_selector('[role="listbox"]', timeout=5000)
            ## 选择"购物车"选项
            await page.locator('[role="option"]:has-text("购物车")').click()
            douyin_logger.debug("[+] 成功选择'购物车'")
            
            # 输入商品链接
            ## 等待商品链接输入框出现
            await page.wait_for_selector('input[placeholder="粘贴商品链接"]', timeout=5000)
            # 输入
            input_field = page.locator('input[placeholder="粘贴商品链接"]')
            await input_field.fill(product_link)
            douyin_logger.debug(f"[+] 已输入商品链接: {product_link}")
            
            # 点击"添加链接"按钮
            add_button = page.locator('span:has-text("添加链接")')
            ## 检查按钮是否可用（没有disable类）
            button_class = await add_button.get_attribute('class')
            if 'disable' in button_class:
                douyin_logger.error("[-] '添加链接'按钮不可用")
                return False
            await add_button.click()
            douyin_logger.debug("[+] 成功点击'添加链接'按钮")
            ## 如果链接不可用
            await page.wait_for_timeout(2000)
            error_modal = page.locator('text=未搜索到对应商品')
            if await error_modal.count():
                confirm_button = page.locator('button:has-text("确定")')
                await confirm_button.click()
                # await page.wait_for_selector('.semi-modal-content', state='hidden', timeout=5000)
                douyin_logger.error("[-] 商品链接无效")
                return False

            # 填写商品短标题
            if not await self.handle_product_dialog(page, product_title):
                return False
            
            # 等待链接添加完成
            douyin_logger.debug("[+] 成功设置商品链接")
            return True
        except Exception as e:
            douyin_logger.error(f"[-] 设置商品链接时出错: {str(e)}")
            return False

    async def main(self):
        async with async_playwright() as playwright:
            await self.upload(playwright)
