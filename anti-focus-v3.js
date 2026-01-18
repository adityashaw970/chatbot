// anti-focus-v3.js - True stealth with proper topmost
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class StealthAntiFocusV3 {
  constructor() {
    this.isWindows = process.platform === 'win32';
    this.windowHandle = null;
    this.initialized = false;
    this.topmostMonitor = null;
  }

  /**
   * Make window clickable overlay that stays on top
   * Uses WS_EX_NOACTIVATE + HWND_TOPMOST
   */
  async makeStealthOverlay(window) {
    if (!this.isWindows || !window) {
      console.log('Non-Windows platform');
      return false;
    }
    
    try {
      const hwnd = window.getNativeWindowHandle();
      this.windowHandle = hwnd;
      const hwndValue = hwnd.readBigInt64LE(0);
      
      // PowerShell script for stealth overlay WITH topmost
      const psScript = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
            [DllImport("user32.dll")]
            public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
            
            [DllImport("user32.dll")]
            public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
            
            [DllImport("user32.dll")]
            public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
        }
"@
        $GWL_EXSTYLE = -20
        $WS_EX_NOACTIVATE = 0x08000000
        $WS_EX_TOOLWINDOW = 0x00000080
        $HWND_TOPMOST = [IntPtr]::new(-1)
        $SWP_NOMOVE = 0x0002
        $SWP_NOSIZE = 0x0001
        $SWP_NOACTIVATE = 0x0010
        $SWP_SHOWWINDOW = 0x0040
        
        $hwnd = [IntPtr]::new(${hwndValue})
        
        # Step 1: Set extended styles for stealth
        $style = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
        $newStyle = $style -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW
        [Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, $newStyle) | Out-Null
        
        # Step 2: Force TOPMOST position (this keeps it above everything)
        [Win32]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, 
          $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE -bor $SWP_SHOWWINDOW) | Out-Null
        
        Write-Output "SUCCESS"
      `;
      
      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
        { timeout: 3000 }
      );
      
      this.initialized = stdout.trim() === 'SUCCESS';
      
      if (this.initialized) {
        console.log('✅ Stealth overlay enabled with TOPMOST');
      }
      
      return this.initialized;
      
    } catch (error) {
      console.error('❌ Stealth overlay failed:', error.message);
      return false;
    }
  }

  /**
   * Start monitoring to maintain TOPMOST position
   * This ensures window stays on top without becoming foreground
   */
  startTopmostMonitoring(window) {
    if (!this.isWindows || !window) return;
    
    // Check and restore topmost every 500ms
    this.topmostMonitor = setInterval(async () => {
      if (!window || window.isDestroyed()) {
        this.stopTopmostMonitoring();
        return;
      }
      
      try {
        const hwnd = window.getNativeWindowHandle();
        const hwndValue = hwnd.readBigInt64LE(0);
        
        const psScript = `
          Add-Type -TypeDefinition @"
          using System;
          using System.Runtime.InteropServices;
          public class Win32 {
              [DllImport("user32.dll")]
              public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
          }
"@
          $HWND_TOPMOST = [IntPtr]::new(-1)
          $SWP_NOMOVE = 0x0002
          $SWP_NOSIZE = 0x0001
          $SWP_NOACTIVATE = 0x0010
          
          $hwnd = [IntPtr]::new(${hwndValue})
          [Win32]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, 
            $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE) | Out-Null
        `;
        
        await execAsync(
          `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
          { timeout: 1000 }
        );
        
      } catch (error) {
        // Silently handle
      }
    }, 500);
    
    console.log('Topmost monitoring active');
  }

  stopTopmostMonitoring() {
    if (this.topmostMonitor) {
      clearInterval(this.topmostMonitor);
      this.topmostMonitor = null;
      console.log('Topmost monitoring stopped');
    }
  }

  /**
   * Toggle WS_EX_TRANSPARENT for click-through
   */
  async setClickThrough(enabled) {
    if (!this.isWindows || !this.windowHandle) return false;
    
    try {
      const hwndValue = this.windowHandle.readBigInt64LE(0);
      
      const psScript = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
            [DllImport("user32.dll")]
            public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
            
            [DllImport("user32.dll")]
            public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
        }
"@
        $GWL_EXSTYLE = -20
        $WS_EX_TRANSPARENT = 0x00000020
        
        $hwnd = [IntPtr]::new(${hwndValue})
        $style = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
        
        ${enabled ? 
          '$newStyle = $style -bor $WS_EX_TRANSPARENT' : 
          '$newStyle = $style -band (-bnot $WS_EX_TRANSPARENT)'}
        
        [Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, $newStyle)
        Write-Output "SUCCESS"
      `;
      
      await execAsync(
        `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
        { timeout: 1000 }
      );
      
      return true;
      
    } catch (error) {
      console.error('Click-through toggle failed:', error.message);
      return false;
    }
  }

  /**
   * Optional: Capture protection
   */
  async enableCaptureProtection(window) {
    if (!this.isWindows) return false;
    
    try {
      const hwnd = window.getNativeWindowHandle();
      const hwndValue = hwnd.readBigInt64LE(0);
      
      const psScript = `
        Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class DWM {
            [DllImport("dwmapi.dll")]
            public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
        }
"@
        try {
          $hwnd = [IntPtr]::new(${hwndValue})
          $value = 11
          [DWM]::DwmSetWindowAttribute($hwnd, 11, [ref]$value, 4)
          Write-Output "SUCCESS"
        } catch {
          Write-Output "UNSUPPORTED"
        }
      `;
      
      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript}"`,
        { timeout: 2000 }
      );
      
      const success = stdout.trim() === 'SUCCESS';
      if (success) {
        console.log('Capture protection enabled');
      }
      
      return success;
      
    } catch (error) {
      return false;
    }
  }

  isInitialized() {
    return this.initialized;
  }

  cleanup() {
    this.stopTopmostMonitoring();
  }
}

module.exports = StealthAntiFocusV3;