// 善驮论文工坊 —— 单文件启动器（.NET Framework 4.x / WinForms）
// 编译：csc /target:winexe /optimize+ /out:"善驮论文工坊.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll src\launcher.cs
// 行为：在 127.0.0.1 上启动本地静态服务器 → 打开默认浏览器 → 常驻托盘，菜单可打开界面或退出。

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace PaperLab
{
    static class Program
    {
        const string AppName = "善驮论文工坊";
        const string Version = "0.2.0";
        static readonly int[] Ports = { 8777, 8778, 8779, 8780, 8790 };

        static string root;
        static int port;
        static TcpListener listener;
        static NotifyIcon tray;
        static Mutex mutex;
        static string portFile;

        static readonly Dictionary<string, string> Mime = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".htm",  "text/html; charset=utf-8" },
            { ".css",  "text/css; charset=utf-8" },
            { ".js",   "application/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".md",   "text/markdown; charset=utf-8" },
            { ".txt",  "text/plain; charset=utf-8" },
            { ".svg",  "image/svg+xml" },
            { ".png",  "image/png" },
            { ".jpg",  "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".gif",  "image/gif" },
            { ".ico",  "image/x-icon" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" },
            { ".pdf",  "application/pdf" }
        };

        [STAThread]
        static void Main(string[] args)
        {
            bool openBrowser = true;
            foreach (string a in args)
            {
                if (a == "--no-browser" || a == "/nobrowser") openBrowser = false;
            }

            portFile = Path.Combine(Path.GetTempPath(), "paperlab.port");

            bool createdNew;
            mutex = new Mutex(true, "PaperLab.SingleInstance.v2", out createdNew);
            if (!createdNew)
            {
                if (openBrowser)
                {
                    int running = ReadPortFile();
                    OpenBrowser(running > 0 ? "http://127.0.0.1:" + running + "/" : "http://127.0.0.1:8777/");
                }
                return;
            }

            root = Canon(AppDomain.CurrentDomain.BaseDirectory).TrimEnd('\\');
            if (!File.Exists(Path.Combine(root, "index.html")))
            {
                MessageBox.Show("未找到 index.html。\n请把「" + AppName + ".exe」与 index.html、assets、js 放在同一个文件夹内运行。",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!StartServer())
            {
                MessageBox.Show("端口 8777-8790 均被占用，无法启动本地服务。\n请关闭占用端口的程序后重试。",
                    AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try { CreateTray(); } catch { }
            if (openBrowser) OpenBrowser("http://127.0.0.1:" + port + "/");

            if (tray != null)
            {
                try { tray.ShowBalloonTip(2500, AppName + " 已启动", "地址：http://127.0.0.1:" + port + "/\n关闭：右键托盘图标 → 退出", ToolTipIcon.Info); }
                catch { }
            }

            Application.Run();

            if (listener != null) { try { listener.Stop(); } catch { } }
            try { File.Delete(portFile); } catch { }
            if (mutex != null) { try { mutex.ReleaseMutex(); } catch { } }
        }

        /* ---------------- 服务器 ---------------- */
        static bool StartServer()
        {
            foreach (int p in Ports)
            {
                try
                {
                    var l = new TcpListener(IPAddress.Loopback, p);
                    l.Start();
                    listener = l;
                    port = p;
                    File.WriteAllText(portFile, p.ToString());
                    var th = new Thread(AcceptLoop);
                    th.IsBackground = true;
                    th.Start();
                    return true;
                }
                catch { }
            }
            return false;
        }

        static void AcceptLoop()
        {
            while (true)
            {
                TcpClient c;
                try { c = listener.AcceptTcpClient(); }
                catch { return; }

                ThreadPool.QueueUserWorkItem(delegate(object state)
                {
                    var client = (TcpClient)state;
                    try { Handle(client); }
                    catch { }
                    finally { try { client.Close(); } catch { } }
                }, c);
            }
        }

        static void Handle(TcpClient client)
        {
            client.ReceiveTimeout = 5000;
            using (NetworkStream ns = client.GetStream())
            {
                var head = new List<byte>(1024);
                var one = new byte[1];
                int total = 0;
                while (total < 16384)
                {
                    int n = ns.Read(one, 0, 1);
                    if (n <= 0) return;
                    head.Add(one[0]);
                    total++;
                    int c = head.Count;
                    if (c >= 4 && head[c - 4] == 13 && head[c - 3] == 10 && head[c - 2] == 13 && head[c - 1] == 10) break;
                }
                string header = Encoding.ASCII.GetString(head.ToArray());
                string[] lines = header.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                if (lines.Length == 0) return;

                string[] parts = lines[0].Split(' ');
                if (parts.Length < 2) return;
                string method = parts[0].ToUpperInvariant();
                bool headOnly = method == "HEAD";
                if (method != "GET" && !headOnly) { Write(ns, "405 Method Not Allowed", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("405"), false); return; }

                string raw = parts[1];
                int q = raw.IndexOf('?');
                if (q >= 0) raw = raw.Substring(0, q);
                raw = Uri.UnescapeDataString(raw);
                if (string.IsNullOrEmpty(raw) || raw == "/") raw = "/index.html";

                string rel = raw.TrimStart('/').Replace('/', '\\');
                string full;
                try { full = Canon(Path.GetFullPath(Path.Combine(root, rel))); }
                catch { Write(ns, "400 Bad Request", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("400"), headOnly); return; }

                string rootPrefix = root + "\\";
                bool inside = string.Equals(full, root, StringComparison.OrdinalIgnoreCase) ||
                              full.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase);
                if (!inside)
                { Write(ns, "403 Forbidden", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("403"), headOnly); return; }

                if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
                if (!File.Exists(full))
                { Write(ns, "404 Not Found", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("404 Not Found: " + raw), headOnly); return; }

                string ext = Path.GetExtension(full);
                string ctype;
                if (!Mime.TryGetValue(ext ?? "", out ctype)) ctype = "application/octet-stream";

                byte[] body;
                try { body = File.ReadAllBytes(full); }
                catch { Write(ns, "500 Internal Server Error", "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("500"), headOnly); return; }

                Write(ns, "200 OK", ctype, body, headOnly);
            }
        }

        static void Write(NetworkStream ns, string status, string ctype, byte[] body, bool headOnly)
        {
            string header = "HTTP/1.1 " + status + "\r\n" +
                            "Content-Type: " + ctype + "\r\n" +
                            "Content-Length: " + body.Length + "\r\n" +
                            "Cache-Control: no-store\r\n" +
                            "X-Content-Type-Options: nosniff\r\n" +
                            "Connection: close\r\n\r\n";
            byte[] hb = Encoding.ASCII.GetBytes(header);
            ns.Write(hb, 0, hb.Length);
            if (!headOnly && body.Length > 0) ns.Write(body, 0, body.Length);
            ns.Flush();
        }

        /* ---------------- 托盘 ---------------- */
        static void CreateTray()
        {
            tray = new NotifyIcon();
            tray.Icon = BuildIcon();
            tray.Text = AppName + " v" + Version;
            tray.Visible = true;

            var menu = new ContextMenuStrip();
            var open = new ToolStripMenuItem("打开界面");
            open.Font = new Font(open.Font, FontStyle.Bold);
            open.Click += delegate { OpenBrowser("http://127.0.0.1:" + port + "/"); };
            var copy = new ToolStripMenuItem("复制访问地址");
            copy.Click += delegate { try { Clipboard.SetText("http://127.0.0.1:" + port + "/"); } catch { } };
            var folder = new ToolStripMenuItem("打开程序目录");
            folder.Click += delegate { try { Process.Start("explorer.exe", root); } catch { } };
            var quit = new ToolStripMenuItem("退出");
            quit.Click += delegate { tray.Visible = false; Application.Exit(); };

            menu.Items.Add(open);
            menu.Items.Add(copy);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(folder);
            menu.Items.Add(quit);
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { OpenBrowser("http://127.0.0.1:" + port + "/"); };
        }

        static Icon BuildIcon()
        {
            try
            {
                using (var bmp = new Bitmap(32, 32))
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                    using (var bg = new SolidBrush(Color.FromArgb(24, 92, 102)))
                    using (var fg = new SolidBrush(Color.White))
                    using (var f = new Font("Microsoft YaHei", 17f, FontStyle.Bold, GraphicsUnit.Pixel))
                    {
                        g.FillRectangle(bg, 0, 0, 32, 32);
                        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                        g.DrawString("善", f, fg, new RectangleF(0, 0, 32, 32), sf);
                    }
                    IntPtr h = bmp.GetHicon();
                    return Icon.FromHandle(h);
                }
            }
            catch { return SystemIcons.Application; }
        }

        /* ---------------- 工具 ---------------- */
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern uint GetLongPathName(string shortPath, StringBuilder longPath, uint bufferLength);

        // 统一成长路径形式，避免 8.3 短名（如 ADMINI~1）与长名比较失败导致的 403
        static string Canon(string p)
        {
            if (string.IsNullOrEmpty(p)) return p;
            try
            {
                var sb = new StringBuilder(1024);
                uint n = GetLongPathName(p, sb, (uint)sb.Capacity);
                if (n > 0 && n < sb.Capacity) return sb.ToString();

                // 文件尚不存在时，退一步规范化父目录
                string dir = Path.GetDirectoryName(p);
                string name = Path.GetFileName(p);
                if (!string.IsNullOrEmpty(dir) && !string.IsNullOrEmpty(name))
                {
                    var sb2 = new StringBuilder(1024);
                    uint n2 = GetLongPathName(dir, sb2, (uint)sb2.Capacity);
                    if (n2 > 0 && n2 < sb2.Capacity) return Path.Combine(sb2.ToString(), name);
                }
            }
            catch { }
            return p;
        }

        static void OpenBrowser(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch { try { Process.Start("cmd", "/c start \"\" \"" + url + "\""); } catch { } }
        }

        static int ReadPortFile()
        {
            try
            {
                if (File.Exists(portFile))
                {
                    int p;
                    if (int.TryParse(File.ReadAllText(portFile).Trim(), out p) && p > 0 && p < 65535) return p;
                }
            }
            catch { }
            return 0;
        }
    }
}
