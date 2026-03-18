# XWare ProGuard rules
-keep class com.xware.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
