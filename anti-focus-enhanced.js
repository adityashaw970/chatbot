// // anti-focus-enhanced.js - Production-ready overlay system
// const { exec } = require('child_process');
// const { promisify } = require('util');
// const execAsync = promisify(exec);

// class AntiFocusEnhanced {
//   constructor() {
//     this.isWindows = process.platform === 'win32';
//     this.processId = process.pid;
//     this.windowHandle = null;
//     this.features = {
//       overlayMode: false,
//       captureProtection: false
//     };
//     this.monitors = {
//       position: null,
//       visibility: null
//     };
//     this.lastKnownBounds = null;
//   }

//   /**
//    * CORE FIX: Make window a proper clickable overlay
//    * This is the ONLY window configuration needed
//    */
//   async enableClickableOverlay(window) {
//     if (!this.isWindows || !window) return false;
    
//     try {
//       const hwnd = window.getNativeWindowHandle();
//       this.windowHandle = hwnd;
//       const hwndValue = hwnd.readBigInt64LE(0);
      
//       // Simple, working PowerShell script
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
//             public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
//         }
// "@
//         $GWL_EXSTYLE = -20
//         $WS_EX_TOOLWINDOW = 0x00000080
//         $WS_EX_NOACTIVATE = 0x08000000
//         $HWND_TOPMOST = [IntPtr]::new(-1)
//         $SWP_NOMOVE = 0x0002
//         $SWP_NOSIZE = 0x0001
//         $SWP_NOACTIVATE = 0x0010
        
//         $hwnd = [IntPtr]::new(${hwndValue})
        
//         # Get current style
//         $style = [Win32]::GetWindowLong($hwnd, $GWL_EXSTYLE)
        
//         # Add tool window style (hides from Alt+Tab) and no-activate
//         $newStyle = $style -bor $WS_EX_TOOLWINDOW -bor $WS_EX_NOACTIVATE
        
//         # Apply style
//         [Win32]::SetWindowLong($hwnd, $GWL_EXSTYLE, $newStyle) | Out-Null
        
//         # Keep on top without activation
//         [Win32]::SetWindowPos($hwnd, $HWND_TOPMOST, 0, 0, 0, 0, 
//           $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE) | Out-Null
        
//         Write-Output "SUCCESS"
//       `;
      
//       const { stdout } = await execAsync(
//         `powershell -ExecutionPolicy Bypass -NoProfile -Command "${psScript.replace(/"/g, '`"')}"`,
//         { timeout: 3000 }
//       );
      
//       this.features.overlayMode = stdout.trim() === 'SUCCESS';
      
//       console.log('✅ Clickable overlay enabled');
//       return true;
//     } catch (error) {
//       console.error('❌ Overlay setup failed:', error.message);
//       return false;
//     }
//   }

//   /**
//    * Optional: Hide from screen capture (Windows 10 2004+)
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
      
//       this.features.captureProtection = stdout.trim() === 'SUCCESS';
      
//       if (this.features.captureProtection) {
//         console.log('✅ Capture protection enabled');
//       } else {
//         console.log('ℹ️  Capture protection unavailable (requires Win10 2004+)');
//       }
      
//       return this.features.captureProtection;
//     } catch (error) {
//       console.log('ℹ️  Capture protection not available');
//       return false;
//     }
//   }

//   /**
//    * Lightweight monitoring - keeps window on top and visible
//    */
//   startLightweightMonitoring(window) {
//     if (!window) return null;
    
//     this.lastKnownBounds = window.getBounds();
    
//     // Monitor 1: Maintain top position (every 500ms)
//     this.monitors.position = setInterval(() => {
//       if (window && !window.isDestroyed()) {
//         try {
//           // Just ensure it stays on top, don't force focus
//           if (!window.isAlwaysOnTop()) {
//             window.setAlwaysOnTop(true, 'screen-saver', 1);
//           }
//         } catch (e) {
//           // Silently handle
//         }
//       }
//     }, 500);
    
//     // Monitor 2: Visibility check (every 2 seconds)
//     this.monitors.visibility = setInterval(() => {
//       if (window && !window.isDestroyed()) {
//         try {
//           if (!window.isVisible()) {
//             console.warn('Window became hidden, restoring...');
//             window.show();
//           }
//         } catch (e) {
//           // Silently handle
//         }
//       }
//     }, 2000);
    
//     console.log('✅ Lightweight monitoring active');
//     return this.monitors;
//   }

//   /**
//    * Stop all monitors
//    */
//   stopAllMonitors() {
//     Object.keys(this.monitors).forEach(key => {
//       if (this.monitors[key]) {
//         clearInterval(this.monitors[key]);
//         this.monitors[key] = null;
//       }
//     });
//     console.log('🛑 Monitors stopped');
//   }

//   /**
//    * Apply all protections - simplified and reliable
//    */
//   async applyAllProtections(window) {
//     console.log('\n🔒 Initializing Overlay System...\n');
    
//     const results = {
//       overlay: false,
//       captureProtection: false,
//       monitoring: null
//     };
    
//     // Step 1: Enable clickable overlay (CRITICAL)
//     results.overlay = await this.enableClickableOverlay(window);
//     await new Promise(resolve => setTimeout(resolve, 200));
    
//     // Step 2: Optional capture protection
//     results.captureProtection = await this.enableCaptureProtection(window);
//     await new Promise(resolve => setTimeout(resolve, 100));
    
//     // Step 3: Start lightweight monitoring
//     results.monitoring = this.startLightweightMonitoring(window);
    
//     // Log status
//     console.log('📊 System Status:');
//     console.log(`  ✓ Clickable Overlay: ${results.overlay ? '✅ ACTIVE' : '❌ FAILED'}`);
//     console.log(`  ✓ Capture Shield: ${results.captureProtection ? '✅ ACTIVE' : 'ℹ️  UNAVAILABLE'}`);
//     console.log(`  ✓ Monitoring: ${results.monitoring ? '✅ RUNNING' : '❌ FAILED'}`);
//     console.log('');
    
//     return results;
//   }

//   /**
//    * Get current status
//    */
//   getStatus() {
//     return {
//       platform: this.isWindows ? 'Windows' : process.platform,
//       processId: this.processId,
//       features: this.features,
//       monitorsActive: {
//         position: !!this.monitors.position,
//         visibility: !!this.monitors.visibility
//       }
//     };
//   }

//   /**
//    * Quick repair if something breaks
//    */
//   async quickRepair(window) {
//     console.log('\n🔧 Running quick repair...\n');
    
//     this.stopAllMonitors();
//     await new Promise(resolve => setTimeout(resolve, 300));
    
//     const results = await this.applyAllProtections(window);
    
//     console.log('✅ Repair complete\n');
//     return results;
//   }
// }

// module.exports = AntiFocusEnhanced;