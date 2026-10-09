# Cơ chế agent của SignalCoach

Mỗi buổi luyện do **một agent duy nhất** điều khiển. Nguyên tắc thiết kế: **LLM đề xuất, code quyết
định**. Model đọc hội thoại và đưa ra nhận định; một state machine thuần (không I/O, có unit test)
áp các quy tắc cứng mà model không được phép phá, rồi mới cho persona nói. Nhờ vậy mọi quyết định
đều giải thích được, lặp lại được và kiểm tra được.

## 1. Vòng lặp mỗi lượt (`server/src/agent/turnRunner.ts`)

```
câu hỏi mới ─▶ ① JUDGE (LLM, JSON) ─▶ ② STATE MACHINE (code) ─▶ ③ PERSONA (LLM, stream) ─▶ ④ LƯU
                 questionType          decision {action, reason}    trả lời trong vai        turns, signals,
                 followUp verdict      chuyển trạng thái tín hiệu   chỉ thấy lớp đã mở       decision log,
                 plantCandidate        tool calls                                            tool calls
```

| Bước | Làm gì | Ở đâu |
|---|---|---|
| ① Judge | Phân loại câu hỏi (good / leading / closed / vague / double / future / bare_why / over_talking); xét câu hỏi có đào sâu tín hiệu đang mở không (caught / partial / none, kèm trích dẫn + confidence); chọn tín hiệu PENDING hợp để kể lúc này; phát hiện cố phá vai. Output JSON kiểm tra bằng Zod, sai thì gọi lại một lần, vẫn sai thì dùng giá trị an toàn (không đổi trạng thái). | `judge.ts` |
| ② State machine | Áp quy tắc cứng (bên dưới), trả về `decision` và trạng thái tín hiệu mới cùng danh sách tool call. | `stateMachine.ts` |
| ③ Persona | Prompt gồm persona + những điều **đã kể** (để nhất quán) + chỉ dẫn cho lượt này (kể chi tiết X / trả lời ngắn / hỏi lại / giữ vai / gợi ý kết thúc). Lớp tín hiệu chưa mở **không bao giờ** vào prompt, nên có bị jailbreak cũng không có gì để lộ. | `personaPrompt.ts` |
| ④ Lưu | Chỉ ghi trạng thái sau khi persona trả lời thành công; lỗi thì buổi vẫn ở đúng chỗ cũ và client thử lại với cùng `clientMessageId` (idempotent). | `turnRunner.ts` |

### Quy tắc cứng trong state machine

1. **Câu gộp hai ý → hỏi lại.** Không chấm, không thả tín hiệu, cửa sổ hỏi tiếp không trôi (FR-5).
2. **Cửa sổ hỏi tiếp = 2 câu hỏi.** Tín hiệu vừa kể (`seeded`) được xét trên 2 câu hỏi kế tiếp; hết
   cửa sổ mà không hỏi → `missed`. `partial` chỉ được nâng lên `caught` trong cửa sổ đó (FR-3).
3. **Confidence < 0.6 → `unsure`**, không đoán. Review cuối buổi xem lại các ca này (FR-3, FR-6).
4. **Mỗi lượt tối đa một tín hiệu.** Thả tín hiệu được ưu tiên hơn kể sâu tín hiệu khác (FR-2).
5. **Thả tự nhiên nhưng không bỏ sót.** Judge chọn thời điểm; code chặn thả hai lượt liên tiếp khi
   buổi còn sớm (cho tự nhiên) nhưng từ câu hỏi thứ 8 trở đi thả mỗi lượt cho tới hết (dễ trước, khó
   sau). Câu hỏi dẫn dắt/đóng vẫn nhận tín hiệu, chỉ phần còn lại bị kể ngắn — quy tắc ưu tiên §4.2.
6. **Kể sâu hơn = thang 3 lớp.** Mỗi tín hiệu có lớp 1 (buột miệng), lớp 2 (chuyện đã xảy ra), lớp 3
   (lý do thật). Hỏi đúng thì mở lớp tiếp theo; hỏi "tại sao" trống hay dẫn dắt thì persona viện lý do.
7. **Giữ vai** khi bị yêu cầu bỏ chỉ dẫn / liệt kê tín hiệu (FR-4).
8. **Gợi ý kết thúc** một lần duy nhất khi mọi tín hiệu đã ra, cửa sổ đã đóng và ≥ 8 câu hỏi.

Mọi quyết định được ghi `{action, reason, signalId}` cùng tool call trên lượt persona, và hiển thị ở
trang **Toàn bộ hội thoại → "Hiện quyết định của agent"**.

### Tool

| Tool | Khi nào | Kiểm tra |
|---|---|---|
| `seed_signal(signalId)` | state machine quyết định thả | id phải pending, một tín hiệu/lượt |
| `update_signal_status(signalId, status, confidence, evidenceTurn)` | sau khi judge chấm | chuyển trạng thái hợp lệ, ngưỡng unsure |
| `reveal_layer(signalId, depth)` | hỏi đúng tín hiệu đã kể | depth ≤ số lớp |
| `end_session(reason)` | persona gợi ý kết thúc / người dùng bấm Kết thúc | đóng tín hiệu còn lại |
| `lookup_interview_principle(mistakeType)` | **chỉ** khi viết góp ý cuối buổi | góp ý không tra được nguyên tắc bị loại |

## 2. Kết thúc buổi: review + tự kiểm tra (`review.ts`)

1. Code đóng trạng thái: `pending → not_surfaced`, `seeded → missed`; buổi < 6 câu hỏi → *insufficient*
   (không chấm); còn tín hiệu chưa ra → *incomplete* (không điểm, vẫn có góp ý); đủ → *complete*.
2. Model review (thinking cao) đọc **toàn bộ** hội thoại, biết rõ cửa sổ hỏi tiếp của từng tín hiệu,
   và đề xuất: trạng thái cuối + trích dẫn bằng chứng cho mỗi tín hiệu, câu hỏi đáng lẽ nên hỏi, danh
   sách câu hỏi cần viết lại, 1–3 trọng tâm, một câu tổng kết.
3. **Self-check bằng code**, mọi sửa đổi ghi vào `selfCheckLog` (trước/sau):
   - trích dẫn phải có nguyên văn trong đúng lượt, lượt đó phải nằm trong cửa sổ — không thì giữ kết
     luận trong buổi, hoặc hạ thành `unsure` ("Hệ thống chưa chắc chắn");
   - `not_surfaced` không thể bị đổi;
   - câu gợi ý trùng câu đã hỏi (Dice ≥ 0.7) bị loại và thay bằng câu bám vào chính lời persona;
   - mỗi góp ý phải trỏ tới một lượt câu hỏi thật, có rewrite, và tra được nguyên tắc bằng
     `lookup_interview_principle` — không thì loại; cố phá vai không bị tính là lỗi đặt câu hỏi;
   - trọng tâm 1–3, mã nguyên tắc không tồn tại bị xoá, thiếu thì suy ra từ tín hiệu bỏ lỡ.
4. Điểm = (caught + ½·partial) / (tổng − unsure), chỉ cho buổi *complete*. Mẫu số luôn là cả kịch bản
   nên kết thúc sớm không thể làm điểm cao lên.

## 3. Đối chiếu với yêu cầu đề bài

| Yêu cầu | Thể hiện |
|---|---|
| Hiểu mục tiêu phiên | Guide snapshot trong session: chủ đề + danh sách tín hiệu cần thả |
| Quyết định theo ngữ cảnh | Judge chọn thời điểm thả, state machine chọn action (plant / go_deeper / brief / clarify / stay / propose_end) |
| Trạng thái có cấu trúc | `signals[]` (status, layer, surfacedTurn, cửa sổ, evidence, confidence), `revealedFacts[]`, `flags[]`, decision log |
| Thiếu / không chắc / mâu thuẫn | hỏi lại khi gộp ý; `partial`; `unsure` dưới ngưỡng; persona chỉ thấy điều đã kể nên không tự mâu thuẫn |
| Dùng tool khi cần | 5 tool có kiểm tra; `lookup_interview_principle` chỉ gọi khi có góp ý |
| Tự kiểm tra | review + self-check với nhật ký trước/sau |
| Đầu ra dùng tiếp | scorecard, lịch sử, trọng tâm buổi sau, trang hội thoại có quyết định của agent |

## 4. Mở rộng: agent tạo kịch bản (`guideGenerator.ts`)

Từ mô tả sản phẩm + người dùng, model viết cả kịch bản (persona, 4 câu gợi ý, 6 tín hiệu × 3 lớp,
đủ 4 loại và 3 mức khó). Kết quả phải qua đúng `GuideSchema` mới được lưu (sai thì gửi lỗi lại cho
model sửa một lần); mô tả quá mơ hồ thì model trả về câu hỏi làm rõ thay vì bịa. Kịch bản thuộc về
người tạo; session lưu snapshot nên xoá kịch bản không ảnh hưởng lịch sử.
