#include <napi.h>

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <winternl.h>
#include <vector>
#include <string>

// Environment detection structure
struct EnvironmentInfo {
    bool isVirtualMachine;
    bool isSandbox;
    bool hasDebugger;
    bool isLimitedUser;
    int processorCount;
    DWORDLONG physicalMemory;
    std::string osVersion;
};

// Detect if running in a Virtual Machine
bool DetectVirtualMachine() {
    // Check processor count (VMs often have limited CPUs)
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    if (si.dwNumberOfProcessors < 2) {
        return true;
    }
    
    // Check for VM-specific registry keys
    HKEY hKey;
    const char* vmKeys[] = {
        "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0",
        "HARDWARE\\Description\\System",
        "SOFTWARE\\VMware, Inc.\\VMware Tools"
    };
    
    for (const char* keyPath : vmKeys) {
        if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, keyPath, 0, KEY_READ, &hKey) == ERROR_SUCCESS) {
            char value[256];
            DWORD size = sizeof(value);
            
            if (RegQueryValueExA(hKey, "Identifier", NULL, NULL, (LPBYTE)value, &size) == ERROR_SUCCESS) {
                std::string identifier(value);
                if (identifier.find("VBOX") != std::string::npos ||
                    identifier.find("VMware") != std::string::npos ||
                    identifier.find("QEMU") != std::string::npos) {
                    RegCloseKey(hKey);
                    return true;
                }
            }
            RegCloseKey(hKey);
        }
    }
    
    // Check for VM-specific DLLs
    const char* vmDlls[] = {
        "vboxhook.dll",
        "vboxmrxnp.dll",
        "vmhgfs.dll",
        "vmmouse.dll"
    };
    
    for (const char* dll : vmDlls) {
        if (GetModuleHandleA(dll) != NULL) {
            return true;
        }
    }
    
    return false;
}

// Detect sandbox environments
bool DetectSandbox() {
    // Check for known sandbox DLLs
    const char* sandboxDlls[] = {
        "SbieDll.dll",      // Sandboxie
        "dbghelp.dll",      // Debugging tools
        "api_log.dll",      // API monitoring
        "pstorec.dll",      // Protected storage
        "vmcheck.dll",      // VM check tools
        "wpespy.dll",       // WPE Pro
        "cmdvrt32.dll",     // Comodo sandbox
        "cmdvrt64.dll"      // Comodo sandbox 64-bit
    };
    
    for (const char* dll : sandboxDlls) {
        if (GetModuleHandleA(dll) != NULL) {
            return true;
        }
    }
    
    // Check for sandbox-indicative file paths
    const char* sandboxPaths[] = {
        "C:\\analysis",
        "C:\\iDEFENSE",
        "C:\\stuff",
        "C:\\virus"
    };
    
    for (const char* path : sandboxPaths) {
        if (GetFileAttributesA(path) != INVALID_FILE_ATTRIBUTES) {
            return true;
        }
    }
    
    return false;
}

// Get comprehensive environment information
EnvironmentInfo GetEnvironmentInfo() {
    EnvironmentInfo info = {0};
    
    info.isVirtualMachine = DetectVirtualMachine();
    info.isSandbox = DetectSandbox();
    info.hasDebugger = IsDebuggerPresent();
    
    // Get system info
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    info.processorCount = si.dwNumberOfProcessors;
    
    // Get physical memory
    MEMORYSTATUSEX memStatus;
    memStatus.dwLength = sizeof(memStatus);
    if (GlobalMemoryStatusEx(&memStatus)) {
        info.physicalMemory = memStatus.ullTotalPhys / (1024 * 1024); // MB
    }
    
    // Check if running with limited privileges
    HANDLE hToken;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
        TOKEN_ELEVATION elevation;
        DWORD size;
        if (GetTokenInformation(hToken, TokenElevation, &elevation, sizeof(elevation), &size)) {
            info.isLimitedUser = !elevation.TokenIsElevated;
        }
        CloseHandle(hToken);
    }
    
    return info;
}

// Request elevated privileges (for compatibility)
bool RequestElevatedPrivileges() {
    HANDLE hToken;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &hToken)) {
        return false;
    }
    
    TOKEN_PRIVILEGES tp;
    LUID luid;
    
    // Try to enable SE_DEBUG_NAME privilege
    if (LookupPrivilegeValue(NULL, SE_DEBUG_NAME, &luid)) {
        tp.PrivilegeCount = 1;
        tp.Privileges[0].Luid = luid;
        tp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;
        
        AdjustTokenPrivileges(hToken, FALSE, &tp, sizeof(tp), NULL, NULL);
    }
    
    CloseHandle(hToken);
    return GetLastError() == ERROR_SUCCESS;
}

// Optimize for sandbox environments
bool OptimizeForSandbox() {
    // Set process priority to ensure responsiveness
    SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS);
    
    // Disable error dialogs
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    
    // Set working set size for better memory management
    SIZE_T minSize = 1024 * 1024 * 10;  // 10 MB
    SIZE_T maxSize = 1024 * 1024 * 100; // 100 MB
    SetProcessWorkingSetSize(GetCurrentProcess(), minSize, maxSize);
    
    return true;
}

// Check system compatibility
bool CheckSystemCompatibility() {
    OSVERSIONINFOEX osvi;
    ZeroMemory(&osvi, sizeof(OSVERSIONINFOEX));
    osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
    
    // Windows 10 version 1903 or later recommended
    osvi.dwMajorVersion = 10;
    osvi.dwMinorVersion = 0;
    osvi.dwBuildNumber = 18362; // Build 1903
    
    DWORDLONG dwlConditionMask = 0;
    VER_SET_CONDITION(dwlConditionMask, VER_MAJORVERSION, VER_GREATER_EQUAL);
    VER_SET_CONDITION(dwlConditionMask, VER_MINORVERSION, VER_GREATER_EQUAL);
    VER_SET_CONDITION(dwlConditionMask, VER_BUILDNUMBER, VER_GREATER_EQUAL);
    
    return VerifyVersionInfo(&osvi, 
        VER_MAJORVERSION | VER_MINORVERSION | VER_BUILDNUMBER, 
        dwlConditionMask);
}

// ==================== NAPI Bindings ====================

// Detect environment
Napi::Object DetectEnvironment(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    EnvironmentInfo envInfo = GetEnvironmentInfo();
    
    result.Set("isVirtualMachine", Napi::Boolean::New(env, envInfo.isVirtualMachine));
    result.Set("isSandbox", Napi::Boolean::New(env, envInfo.isSandbox));
    result.Set("hasDebugger", Napi::Boolean::New(env, envInfo.hasDebugger));
    result.Set("isLimitedUser", Napi::Boolean::New(env, envInfo.isLimitedUser));
    result.Set("processorCount", Napi::Number::New(env, envInfo.processorCount));
    result.Set("physicalMemoryMB", Napi::Number::New(env, envInfo.physicalMemory));
    
    return result;
}

// Optimize for current environment
Napi::Boolean OptimizeEnvironment(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    bool success = OptimizeForSandbox();
    RequestElevatedPrivileges();
    
    return Napi::Boolean::New(env, success);
}

// Check compatibility
Napi::Boolean CheckCompatibility(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Boolean::New(env, CheckSystemCompatibility());
}

// Get process information
Napi::Object GetProcessInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        result.Set("workingSetSize", Napi::Number::New(env, pmc.WorkingSetSize / 1024));
        result.Set("peakWorkingSetSize", Napi::Number::New(env, pmc.PeakWorkingSetSize / 1024));
        result.Set("pageFaultCount", Napi::Number::New(env, pmc.PageFaultCount));
    }
    
    result.Set("processId", Napi::Number::New(env, GetCurrentProcessId()));
    result.Set("threadId", Napi::Number::New(env, GetCurrentThreadId()));
    
    return result;
}

// Enable compatibility mode
Napi::Boolean EnableCompatibilityMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Set compatibility flags for better sandbox operation
    HANDLE hProcess = GetCurrentProcess();
    
    // Allow the process to run with lower integrity
    DWORD flags = PROCESS_DEP_ENABLE;
    
    typedef BOOL (WINAPI *SetProcessDEPPolicy_t)(DWORD);
    HMODULE kernel32 = GetModuleHandleA("kernel32.dll");
    
    if (kernel32) {
        SetProcessDEPPolicy_t setDEP = 
            (SetProcessDEPPolicy_t)GetProcAddress(kernel32, "SetProcessDEPPolicy");
        
        if (setDEP) {
            setDEP(flags);
        }
    }
    
    // Optimize scheduling for better responsiveness
    SetPriorityClass(hProcess, HIGH_PRIORITY_CLASS);
    
    return Napi::Boolean::New(env, true);
}

// Get system capabilities
Napi::Object GetSystemCapabilities(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    // Check Windows version
    result.Set("isWindows10Plus", Napi::Boolean::New(env, CheckSystemCompatibility()));
    
    // Check admin rights
    BOOL isAdmin = FALSE;
    PSID adminGroup = NULL;
    SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
    
    if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
        DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
        CheckTokenMembership(NULL, adminGroup, &isAdmin);
        FreeSid(adminGroup);
    }
    
    result.Set("hasAdminRights", Napi::Boolean::New(env, isAdmin));
    result.Set("canModifySystem", Napi::Boolean::New(env, isAdmin));
    
    return result;
}

#else
// Stub implementations for non-Windows platforms
Napi::Object DetectEnvironment(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    result.Set("isVirtualMachine", Napi::Boolean::New(env, false));
    result.Set("isSandbox", Napi::Boolean::New(env, false));
    return result;
}

Napi::Boolean OptimizeEnvironment(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), false);
}

Napi::Boolean CheckCompatibility(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), false);
}

Napi::Object GetProcessInfo(const Napi::CallbackInfo& info) {
    return Napi::Object::New(info.Env());
}

Napi::Boolean EnableCompatibilityMode(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), false);
}

Napi::Object GetSystemCapabilities(const Napi::CallbackInfo& info) {
    return Napi::Object::New(info.Env());
}
#endif

// Module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("detectEnvironment", Napi::Function::New(env, DetectEnvironment));
    exports.Set("optimizeEnvironment", Napi::Function::New(env, OptimizeEnvironment));
    exports.Set("checkCompatibility", Napi::Function::New(env, CheckCompatibility));
    exports.Set("getProcessInfo", Napi::Function::New(env, GetProcessInfo));
    exports.Set("enableCompatibilityMode", Napi::Function::New(env, EnableCompatibilityMode));
    exports.Set("getSystemCapabilities", Napi::Function::New(env, GetSystemCapabilities));
    return exports;
}

NODE_API_MODULE(sandbox, Init)