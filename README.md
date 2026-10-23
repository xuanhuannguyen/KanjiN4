# Kanji N4 — học theo bài

Ứng dụng tĩnh ôn Kanji N4 bằng tiếng Việt. Không có backend, tài khoản hay bước build; dữ liệu bài học đi cùng repo và tiến độ chỉ lưu trong `localStorage` của trình duyệt.

## Chạy trên máy

```sh
python3 -m http.server 8000
```

Mở `http://localhost:8000`. Cần dùng static server để trình duyệt tải JSON; không mở trực tiếp `index.html` bằng `file://`.

## Deploy

- **GitHub Pages:** đẩy repo lên GitHub, vào **Settings → Pages**, chọn nhánh `main` và thư mục `/ (root)`.
- **Vercel:** import repo, để trống Build Command và dùng Output Directory `.`.

## Nội dung và cách học

- `kanji_n4_tong_hop_20_bai.md` là nguồn 20 bài.
- `scripts/build_data.py` tạo `data/lessons.json` với 200 Kanji Core, 637 từ vựng, khóa ổn định, liên kết Kanji–từ và các trường theo mẫu Hikari. Những dữ liệu chưa được xác minh như nét, bộ thủ, pitch accent, phân tích đọc và ví dụ được để trống/null; trạng thái nội dung là `draft`.
- Mỗi bài có bộ flashcard, ghép cặp và trắc nghiệm riêng cho Kanji Core và từ vựng. Không trộn dữ liệu của các bài trong phiên học.
- `app.js` hiển thị bài học, tra cứu từ vựng, phát âm bằng Web Speech API nếu trình duyệt có giọng Nhật, và ghi tiến độ cục bộ.
- `sw.js` cache vỏ ứng dụng và các tệp được tải để hỗ trợ dùng lại khi offline.

## Cấu trúc Kanji theo Hikari

Trang bài học dùng bố cục hai cột **Kanji Core / Kanji Vocab**, mỗi phần có nút học và kiểm tra riêng. Chạm một chữ mở trang chi tiết với ảnh gợi nhớ, cách đọc, từ liên quan và nút chuyển chữ trước/sau. Chọn kiểm tra sẽ mở màn giới thiệu, bảng số câu, lựa chọn đáp án, nộp bài và trang kết quả có thống kê cùng phần xem lại. Các luồng dùng hash route và dữ liệu tĩnh; tiến độ kiểm tra lưu trên thiết bị.

## Hình gợi nhớ Kanji

Mỗi ảnh hoàn chỉnh có ba bước ngang trên nền trắng ấm: cảnh gợi nghĩa với dáng/hướng của vật thể bám theo cấu trúc nét; hình rút gọn; Kanji chuẩn ghép bằng font ở bước cuối. ImageGen chỉ tạo hai bước đầu và không vẽ chữ Kanji. `scripts/compose_triptych.py` ghép glyph đúng theo font.

Ảnh hoàn chỉnh hiện có cho 200 chữ của Bài 1–20 nằm trong `assets/kanji/`. Ảnh `明` đã được duyệt theo quy tắc hình học: vật thể trong cảnh thật thể hiện hướng và bố cục các thành phần trước khi rút gọn thành hình giữa. Ảnh nguồn, bản ghép xem trước và các bản sản xuất cũ được giữ trong `assets/kanji-preview/`. Chữ chưa có ảnh dùng hình gợi nhớ tạm trong giao diện; đường dẫn `media.hintImage` chỉ được điền khi tệp ảnh tồn tại.

## Nguồn tham khảo

- [Hikari](https://hikarimmjp.com/) — tham khảo nhịp học và ảnh Kanji Core N5 ba bước, nền sáng, minh họa 2D.
- [LearnJapaneseAZ — Kanji Look and Learn Lesson 1](https://learnjapaneseaz.com/kanji-look-and-learn-lesson-1.html) — tham khảo nghĩa, gợi nhớ và ví dụ từ.
- [LearnJapaneseAZ — Kanji Look and Learn Lesson 2](https://learnjapaneseaz.com/kanji-look-and-learn-lesson-2.html)
- [Japan Foundation — Kanji Memory Hint](https://www.jpf.go.jp/j/kansai/clip/kanjimemoryhint/)

## Tạo lại dữ liệu

Sau khi sửa Markdown nguồn:

```sh
python3 scripts/build_data.py
```
# KanjiN4
