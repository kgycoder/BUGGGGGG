# X-WARE Android

YouTube 뮤직 플레이어 — Windows WPF 앱을 Android로 포팅한 버전

## APK 빌드 방법

### 방법 1: GitHub Actions (가장 쉬움 ⭐)

1. 이 폴더를 GitHub에 push
2. **Actions** 탭 → **Build APK** → **Run workflow**
3. 완료 후 Artifacts에서 `XWare-debug-N.apk` 다운로드
4. 기기에 설치 (설정 → 알 수 없는 앱 → 허용 필요)

### 방법 2: Android Studio

```
1. Android Studio 열기
2. File → Open → 이 폴더 선택
3. Gradle sync 완료 대기
4. Build → Build Bundle(s) / APK(s) → Build APK(s)
5. app/build/outputs/apk/debug/app-debug.apk
```

### 방법 3: 커맨드라인

```bash
# macOS / Linux
chmod +x ./gradlew
./gradlew assembleDebug

# Windows
gradlew.bat assembleDebug

# 결과물
app/build/outputs/apk/debug/app-debug.apk
```

## 요구사항

- Android 8.0 (API 26) 이상
- 인터넷 연결 필수 (YouTube API 사용)

## 기능

- YouTube 음악 검색 및 재생
- 실시간 가사 동기화 (lrclib.net)
- 즐겨찾기 / 대기열 / 플레이리스트
- 투명 가사 오버레이 (오버레이 권한 필요)
- 에코 효과 / 셔플 / 반복
- 다이나믹 비트 반응형 배경
