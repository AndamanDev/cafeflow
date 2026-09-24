# CafeFlow — ส่ง byte ESC/POS เข้าเครื่องพิมพ์ Windows แบบ RAW
#
# ข้ามการเรนเดอร์ของไดรเวอร์ทั้งหมด (datatype RAW) — ไดรเวอร์แค่ส่งผ่านไป
# ไม่ต้องแชร์เครื่องพิมพ์ และไม่ต้องลง npm package ที่มี native binding
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File win-raw.ps1 -Printer "POS-80" -File job.bin
#
# ล้ม = exit 1 พร้อมข้อความทาง stderr ให้ worker เก็บไว้ใน last_error
param(
    [Parameter(Mandatory = $true)][string]$Printer,
    [Parameter(Mandatory = $true)][string]$File
)
$ErrorActionPreference = 'Stop'
# ข้อความ error เป็นภาษาไทย — ค่าเริ่มของคอนโซลเป็น codepage เครื่อง Node จะอ่านเพี้ยน
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class CfRawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    static extern bool WritePrinter(IntPtr h, byte[] buf, int len, out int written);

    public static void Send(string printer, byte[] data) {
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero))
            throw new Exception("เปิดเครื่องพิมพ์ไม่ได้ (Win32 " + Marshal.GetLastWin32Error() + ")");
        try {
            var di = new DOCINFO { pDocName = "CafeFlow", pDataType = "RAW" };
            if (StartDocPrinter(h, 1, di) == 0)
                throw new Exception("เริ่มงานพิมพ์ไม่ได้ (Win32 " + Marshal.GetLastWin32Error() + ")");
            try {
                StartPagePrinter(h);
                int written;
                if (!WritePrinter(h, data, data.Length, out written) || written != data.Length)
                    throw new Exception("ส่งข้อมูลไม่ครบ (Win32 " + Marshal.GetLastWin32Error() + ")");
                EndPagePrinter(h);
            } finally { EndDocPrinter(h); }
        } finally { ClosePrinter(h); }
    }
}
'@

try {
    [CfRawPrint]::Send($Printer, [System.IO.File]::ReadAllBytes($File))
} catch {
    # ข้อความจริงอยู่ใน InnerException — ตัวนอกเป็นแค่ "Exception calling Send ..."
    $ex = $_.Exception
    if ($ex.InnerException) { $ex = $ex.InnerException }
    [Console]::Error.WriteLine($ex.Message)
    exit 1
}
