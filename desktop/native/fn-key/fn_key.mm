#include <napi.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreFoundation/CoreFoundation.h>

static Napi::ThreadSafeFunction tsfn;
static bool tsfnCreated = false;
static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
static bool fnKeyDown = false;
static bool otherKeyPressedWhileFnHeld = false;

// The fn key modifier flag
static const CGEventFlags kFnKeyMask = 0x00800000; // NX_SECONDARYFNMASK / kCGEventFlagMaskSecondaryFn

// CGEventTap callback - intercepts keyboard events
static CGEventRef EventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void* refcon) {
    // Re-enable tap if it gets disabled (system can disable it under heavy load)
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) {
        CGEventTapEnable(eventTap, true);
        return event;
    }

    CGEventFlags flags = CGEventGetFlags(event);
    bool fnCurrentlyDown = (flags & kFnKeyMask) != 0;

    // Handle flags changed events (modifier keys)
    if (type == kCGEventFlagsChanged) {
        if (fnCurrentlyDown != fnKeyDown) {
            fnKeyDown = fnCurrentlyDown;

            if (fnKeyDown) {
                // fn pressed - reset flag and notify
                otherKeyPressedWhileFnHeld = false;
                tsfn.NonBlockingCall([](Napi::Env env, Napi::Function jsCallback) {
                    jsCallback.Call({Napi::String::New(env, "down")});
                });
            } else {
                // fn released - send "up" only if no other keys were pressed
                bool wasValid = !otherKeyPressedWhileFnHeld;
                otherKeyPressedWhileFnHeld = false;

                tsfn.NonBlockingCall([wasValid](Napi::Env env, Napi::Function jsCallback) {
                    if (wasValid) {
                        jsCallback.Call({Napi::String::New(env, "up")});
                    }
                });
            }
        }
    }

    // Handle key down events - check if other keys pressed while fn held
    if (type == kCGEventKeyDown && fnKeyDown && !otherKeyPressedWhileFnHeld) {
        otherKeyPressedWhileFnHeld = true;
        // Send cancel immediately
        tsfn.NonBlockingCall([](Napi::Env env, Napi::Function jsCallback) {
            jsCallback.Call({Napi::String::New(env, "cancel")});
        });
    }

    return event;
}

// Returns true if the host process has macOS Accessibility trust.
static bool IsAccessibilityTrusted() {
    return AXIsProcessTrusted();
}

// Exposes accessibility trust status to JS without attempting to create the tap.
Napi::Value IsTrusted(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), IsAccessibilityTrusted());
}

// Returns { listening, trusted } so JS can recover from OS-induced tap disablement.
Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object status = Napi::Object::New(env);
    status.Set("listening", Napi::Boolean::New(env, eventTap != NULL));
    status.Set("trusted", Napi::Boolean::New(env, IsAccessibilityTrusted()));
    return status;
}

// Start listening for fn key using CGEventTap
Napi::Value StartListening(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Already listening - return true
    if (eventTap != NULL) {
        return Napi::Boolean::New(env, true);
    }

    // Proactive accessibility check. Without this, CGEventTapCreate silently
    // returns NULL and JS can't distinguish permission denial from other errors.
    if (!IsAccessibilityTrusted()) {
        Napi::Error err = Napi::Error::New(env, "Accessibility permission not granted");
        err.Set("code", Napi::String::New(env, "EACCESS_DENIED"));
        err.ThrowAsJavaScriptException();
        return env.Null();
    }

    // Create thread-safe function for callbacks
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "FnKeyCallback",
        0,
        1
    );
    tsfnCreated = true;

    // Events to monitor: flags changed (for fn key) and key down (for cancel detection)
    CGEventMask eventMask = (1 << kCGEventFlagsChanged) | (1 << kCGEventKeyDown);

    // Create the event tap
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,           // Tap at session level
        kCGHeadInsertEventTap,        // Insert at head
        kCGEventTapOptionListenOnly,  // Listen only, don't modify events
        eventMask,
        EventTapCallback,
        NULL
    );

    if (!eventTap) {
        tsfn.Release();
        tsfnCreated = false;
        Napi::Error::New(env, "Failed to create event tap").ThrowAsJavaScriptException();
        return env.Null();
    }

    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    if (!runLoopSource) {
        CFRelease(eventTap);
        eventTap = NULL;
        tsfn.Release();
        tsfnCreated = false;
        Napi::Error::New(env, "Failed to create run loop source").ThrowAsJavaScriptException();
        return env.Null();
    }
    CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);

    CGEventTapEnable(eventTap, true);

    return Napi::Boolean::New(env, true);
}

// Stop listening
Napi::Value StopListening(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (eventTap) {
        CGEventTapEnable(eventTap, false);
    }

    if (runLoopSource) {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        runLoopSource = NULL;
    }

    if (eventTap) {
        CFRelease(eventTap);
        eventTap = NULL;
    }

    if (tsfnCreated) {
        tsfn.Release();
        tsfnCreated = false;
    }

    fnKeyDown = false;
    otherKeyPressedWhileFnHeld = false;

    return env.Undefined();
}

// Initialize module
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("startListening", Napi::Function::New(env, StartListening));
    exports.Set("stopListening", Napi::Function::New(env, StopListening));
    exports.Set("isTrusted", Napi::Function::New(env, IsTrusted));
    exports.Set("getStatus", Napi::Function::New(env, GetStatus));
    return exports;
}

NODE_API_MODULE(fn_key, Init)
