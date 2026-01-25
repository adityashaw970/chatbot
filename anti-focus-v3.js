// // anti-focus-v3.js - True stealth overlay (never becomes foreground)
// const { exec } = require('child_process');
// const { promisify } = require('util');
// const execAsync = promisify(exec);

// class StealthAntiFocusV3 {
//   constructor() {
//     this.isWindows = process.platform === 'win32';
//     this.windowHandle = null;
//     this.initialized = false;
//   }

//   async makeStealthOverlay(window) {
//     if (!this.isWindows || !window) {
//       console.log('Non-Windows platform');
//       return false;
//     }
    
//     try {
//       const hwnd = window.getNativeWindowHandle();
//       this.windowHandle = hwnd;
//       const hwndValue = hwnd.readBigInt64LE(0);
      
//       // PowerShell script for stealth overlay
//       const psScript = `
//         Add-Type -TypeDefinition @"
//         using System;
//         using System.Runtime.InteropServices;
//         public class Win32 {
//             [DllImport("user32.dll")]
//             public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
            
//             [DllImport("user32.dll")]
//             public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
            
//             [DllImport("user32.dll")]
//             public static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);
            
//             [DllImport("user32.dll")]
//             public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
//         }
// "@
//         $GWL_EXSTYLE = -20
//         $WS_EX_LAYERED = 0x00080000
//         $WS_EX_TRANSPARENT = 0x00000020
//         $WS_EX_NOACTIVATE = 0x08000000
//         $WS_EX_TOOLWINDOW = 0x00000080
//         $LWA_ALPHA = 0x00000002
//         $HWND_TOPMOST = [IntPtr]::new(-1)
//         $SWP_NOMOVE = 0x0002
//         $SWP_NOSIZE = 0x0001
//         $SWP_NOACTIVATE = 0x0010
        
//         $hwnd = [IntPtr]::new(${hwndValue})
        
//         # Step 1: Get current style
//         $style = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
        
//         # Step 2: Add layered, transparent passthrough, no-activate, and tool window
//         $newStyle = $style -bor $WS_EX_LAYERED -bor $WS_EX_TRANSPARENT -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW
        
//         # Step 3: Apply style
//         [Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, $newStyle) | Out-Null
        
//         # Step 4: Set as layered with full opacity (makes WS_EX_TRANSPARENT work)
//         [Win32]::SetLayeredWindowAttributes($hwnd, 0, 255, $LWA_ALPHA) | Out-Null
        
//         # Step 5: Ensure topmost without activation
//         [Win32]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, 
//           $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE) | Out-Null
        
//         Write-Output "SUCCESS"
//       `;
      
//       const { stdout } = await execAsync(
//         `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
//         { timeout: 3000 }
//       );
      
//       this.initialized = stdout.trim() === 'SUCCESS';
      
//       if (this.initialized) {
//         console.log('✅ Stealth overlay enabled (WS_EX_TRANSPARENT mode)');
//       }
      
//       return this.initialized;
      
//     } catch (error) {
//       console.error('❌ Stealth overlay failed:', error.message);
//       return false;
//     }
//   }

//   /**
//    * CRITICAL: Make clickable regions work
//    * WS_EX_TRANSPARENT makes everything click-through
//    * We need to selectively enable clicks on interactive elements
//    */
//   async enableClickRegions(window, regions) {
//     if (!this.isWindows || !window) return false;
    
//     try {
//       const hwnd = window.getNativeWindowHandle();
//       const hwndValue = hwnd.readBigInt64LE(0);
      
//       // This removes WS_EX_TRANSPARENT when mouse is over interactive areas
//       // We'll do this dynamically in the renderer process
//       const psScript = `
//         Add-Type -TypeDefinition @"
//         using System;
//         using System.Runtime.InteropServices;
//         public class Win32 {
//             [DllImport("user32.dll")]
//             public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
            
//             [DllImport("user32.dll")]
//             public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
//         }
// "@
//         $GWL_EXSTYLE = -20
//         $WS_EX_TRANSPARENT = 0x00000020
        
//         $hwnd = [IntPtr]::new(${hwndValue})
//         $style = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
        
//         # Remove WS_EX_TRANSPARENT to allow clicks
//         $newStyle = $style -band (-bnot $WS_EX_TRANSPARENT)
//         [Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, $newStyle)
        
//         Write-Output "SUCCESS"
//       `;
      
//       const { stdout } = await execAsync(
//         `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
//         { timeout: 2000 }
//       );
      
//       console.log('✅ Click regions enabled');
//       return stdout.trim() === 'SUCCESS';
      
//     } catch (error) {
//       console.error('Click regions error:', error.message);
//       return false;
//     }
//   }

//   /**
//    * Alternative approach: Use mouse hook to detect when over our window
//    * Then temporarily remove WS_EX_TRANSPARENT
//    */
//   async setupSmartClickthrough(window) {
//     if (!this.isWindows || !window) return false;
    
//     try {
//       const hwnd = window.getNativeWindowHandle();
//       const hwndValue = hwnd.readBigInt64LE(0);
      
//       // Script that toggles WS_EX_TRANSPARENT based on cursor position
//       const psScript = `
//         Add-Type -TypeDefinition @"
//         using System;
//         using System.Runtime.InteropServices;
//         public class Win32 {
//             [DllImport("user32.dll")]
//             public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
            
//             [DllImport("user32.dll")]
//             public static extern int GetWindowLong(IntPtr hWnd, int nIndex);
            
//             [DllImport("user32.dll")]
//             public static extern bool GetCursorPos(out POINT lpPoint);
            
//             [DllImport("user32.dll")]
//             public static extern IntPtr WindowFromPoint(POINT Point);
            
//             [StructLayout(LayoutKind.Sequential)]
//             public struct POINT {
//                 public int X;
//                 public int Y;
//             }
//         }
// "@
//         # This would need to run continuously
//         # Better to handle in main process
//         Write-Output "SUCCESS"
//       `;
      
//       console.log('Smart click-through setup ready');
//       return true;
      
//     } catch (error) {
//       return false;
//     }
//   }

//   /**
//    * Optional: Capture protection
//    */
//   async enableCaptureProtection(window) {
//     if (!this.isWindows) return false;
    
//     try {
//       const hwnd = window.getNativeWindowHandle();
//       const hwndValue = hwnd.readBigInt64LE(0);
      
//       const psScript = `
//         Add-Type -TypeDefinition @"
//         using System;
//         using System.Runtime.InteropServices;
//         public class DWM {
//             [DllImport("dwmapi.dll")]
//             public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
//         }
// "@
//         try {
//           $hwnd = [IntPtr]::new(${hwndValue})
//           $value = 11
//           [DWM]::DwmSetWindowAttribute($hwnd, 11, [ref]$value, 4)
//           Write-Output "SUCCESS"
//         } catch {
//           Write-Output "UNSUPPORTED"
//         }
//       `;
      
//       const { stdout } = await execAsync(
//         `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript}"`,
//         { timeout: 2000 }
//       );
      
//       const success = stdout.trim() === 'SUCCESS';
//       if (success) {
//         console.log('✅ Capture protection enabled');
//       }
      
//       return success;
      
//     } catch (error) {
//       return false;
//     }
//   }

//   isInitialized() {
//     return this.initialized;
//   }
// }

// module.exports = StealthAntiFocusV3;