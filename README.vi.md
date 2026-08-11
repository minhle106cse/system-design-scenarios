# System Design Scenarios

**Tuyển tập các bài toán kỹ thuật có thật, mỗi bài được giải trọn vẹn từ đầu đến cuối như một dự án
độc lập.**

[🇬🇧 English](README.md) · 🇻🇳 Tiếng Việt

Phần lớn tài liệu system design hoặc là sơ đồ không có code phía sau, hoặc là code không có lập luận
phía sau. Tuyển tập này cố gắng không rơi vào cả hai: mỗi scenario nêu một bài toán thật, bảo vệ một
thiết kế trước những phương án nó đã loại bỏ, ship một backend chạy được, và **chứng minh đúng cái
tính chất khiến bài toán đó khó** bằng một bài test bạn tự chạy được.

Mỗi thư mục là một bài toán có ranh giới rõ ràng. Không có gì dùng chung lúc chạy giữa các scenario —
không thư viện chung, không database chung, không monorepo. Mỗi scenario được thiết kế để clone về và
hiểu độc lập.

> **Có liên quan, nhưng khác về bản chất:** [Cortex](../distributed-social-platform) là một nền tảng
> microservices A–Z đầy đủ — event sourcing, multi-tenancy, RAG, message broker, năm service. Nó trả
> lời câu hỏi *"tôi có dựng nổi cả một nền tảng phân tán không?"* Tuyển tập này trả lời một câu hỏi
> hẹp hơn và khó hơn: *"cho một bài toán cụ thể, đâu là thiết kế ở tầm senior, và tại sao là thiết kế
> này chứ không phải cách hiển nhiên kia?"*

---

## Đọc một scenario như thế nào

Mỗi scenario được viết để bạn dừng ở bất kỳ độ sâu nào cũng thu được thứ gì đó:

| Nếu bạn có… | Hãy đọc | Bạn sẽ nắm được |
|---|---|---|
| **2 phút** | dòng của scenario trong bảng index bên dưới | Bài toán này có đáng để bạn bỏ thời gian không |
| **15 phút** | file **`CASE_STUDY.md`** của nó | Bài toán, vì sao nó khó, thiết kế ra sao, và bạn học được gì |
| **1 tiếng** | `readme.md` → `docs/00_overview.md` → ADR chủ đạo | Toàn bộ lập luận, gồm cả những phương án đã bị loại |
| **một buổi chiều** | clone về, chạy test, thử phá nó | Bảo đảm đó có thật hay không |

**Bắt đầu từ `CASE_STUDY.md`.** Đó là cửa vào của mọi scenario, và luôn có cả bản tiếng Anh lẫn tiếng
Việt.

```bash
git clone git@github.com:minhle106cse/system-design-scenarios.git
cd system-design-scenarios/service-appointment-scheduler   # rồi làm theo RUN.md của nó
```

Mỗi scenario là một **thư mục con của repository này**, không phải submodule — clone một lần là có
tất cả. Lịch sử commit riêng của từng scenario được **gộp vào** chứ không bị squash, nên `git log`
cho thấy đúng cách nó đã được xây, kể cả những chỗ sai.

---

## Bộ tiêu chí mọi scenario đều được mô tả theo

Vẫn bảy nhóm đó, theo đúng thứ tự đó, cho mọi scenario — để hai scenario thực sự **so sánh được với
nhau** chứ không chỉ đọc riêng lẻ. File `CASE_STUDY.md` của scenario trả lời đầy đủ cả bảy nhóm; bảng
index bên dưới tóm tắt nhóm **A** và **F**.

| Nhóm | Trả lời câu hỏi |
|---|---|
| **A · Nhận diện bài toán** | Bài toán là gì, ai thật sự gặp nó, và nó phổ biến đến đâu? |
| **B · Yêu cầu** | Hệ thống phải làm gì, **không** được làm gì, và chỗ nào đề bài còn mơ hồ? |
| **C · Vì sao khó** | Điều gì khiến nó không còn là CRUD, và hỏng chuyện gì nếu làm sai? |
| **D · Thiết kế** | Đã xây cái gì, đã loại bỏ cái gì, và vì sao? |
| **E · Tính đúng đắn** | Cần chứng minh điều gì, và chứng minh bằng cách nào? |
| **F · Giá trị học tập** | Học được gì, cần biết trước những gì, và những cái bẫy nằm ở đâu? |
| **G · Tiến hóa** | Điều gì thay đổi khi quy mô gấp 10 lần, và cái gì đã cố ý hoãn lại? |

Hai tiêu chí được **chấm điểm** để bảng index có thể sắp xếp:

- **Mức độ phổ biến** ★☆☆☆☆ – ★★★★★ — bài toán này xuất hiện trong sản phẩm thật thường xuyên đến đâu,
  không phải nó nổi tiếng đến đâu trong đề phỏng vấn.
- **Độ khó** ★☆☆☆☆ – ★★★★★ — phần **lõi** của bài toán khó đến đâu, bỏ qua đống boilerplate xung quanh.

---

## Danh sách scenario

| # | Scenario | Lĩnh vực | Thách thức cốt lõi | Phổ biến | Độ khó | Trạng thái |
|---|---|---|---|---|---|---|
| **01** | [Service Appointment Scheduler](service-appointment-scheduler/) | Ô tô / Sở hữu xe | Đặt chỗ một tài nguyên dùng chung sao cho đúng **khi có nhiều request đồng thời** | ★★★★★ | ★★★☆☆ | ✅ Hoàn thành |

### 01 · Service Appointment Scheduler (Đặt lịch bảo dưỡng xe)

📖 **[Case study (Tiếng Việt)](service-appointment-scheduler/CASE_STUDY.vi.md)** ·
[English](service-appointment-scheduler/CASE_STUDY.md) ·
[Code](service-appointment-scheduler/)

**Bài toán.** Một trung tâm bảo dưỡng xe có số khoang sửa (service bay) và số kỹ thuật viên cố định,
và mỗi kỹ thuật viên chỉ đủ trình độ cho một số loại dịch vụ nhất định. Khách yêu cầu đặt một dịch vụ
cụ thể, cho một chiếc xe cụ thể, tại một đại lý cụ thể, vào một thời điểm mong muốn. Hệ thống phải
kiểm tra rằng **cả** một khoang sửa **và** một kỹ thuật viên đủ trình độ đều rảnh trong **toàn bộ**
thời lượng dịch vụ, rồi mới tạo bản ghi lịch hẹn bền vững.

**Vì sao nó không phải CRUD.** Việc kiểm tra chỗ trống là một thao tác **đọc**. Giữa lúc đọc ra "khoang
1 rảnh lúc 10:00" và lúc ghi lịch hẹn xuống, một request khác hoàn toàn có thể đã đặt mất đúng khoang
đó — đây chính là race condition kinh điển time-of-check/time-of-use. Không có lượng code ứng dụng nào
bịt được khe này, vì hai request đó không hề nhìn thấy nhau. Tính đúng đắn của cả sản phẩm phụ thuộc
vào việc khe đó được bịt ở một nơi mà **không ai mở lại được**.

**Cách giải.** Ứng dụng vẫn kiểm tra chỗ trống — vì việc đó cho ra những thông báo từ chối cụ thể và
hữu ích ("mọi khoang đều kín" khác với "ở đây không có kỹ thuật viên nào đủ trình độ"). Nhưng tính
đúng đắn **không** dựa vào nó. Một ràng buộc `EXCLUDE USING gist` của PostgreSQL khiến hai lịch hẹn
chồng giờ trên cùng một khoang hoặc cùng một kỹ thuật viên trở nên **không thể biểu diễn được**, bất
kể ứng dụng vừa tin điều gì một khoảnh khắc trước đó. Race condition không bị né tránh; nó bị làm cho
vô hại.

**Bạn học được gì.** Exclusion constraint và range type của PostgreSQL · vì sao ràng buộc ở tầng
database thắng kiểm tra ở tầng ứng dụng · CQRS với ranh giới transaction Unit-of-Work · idempotency
mà không cần Redis · vì sao một bộ test chưa từng đỏ thì không chứng minh được gì · ba tầng test mà
mỗi tầng chứng minh một thứ hai tầng kia về mặt cấu trúc không thể chứng minh.

**Bài toán này còn đúng với:** phòng khám và nha khoa, salon tóc, cho thuê thiết bị, đặt phòng họp,
xếp lịch tòa án, trung tâm dạy lái xe, phòng khám thú y — bất cứ đâu có một lượng tài nguyên hữu hạn
kèm theo một quy tắc về trình độ/điều kiện.

---

## Quy ước dùng chung giữa các scenario

Không được ép bằng code dùng chung — mỗi scenario đứng độc lập — mà giữ bằng thói quen:

- **Cửa vào song ngữ.** Tiếng Anh là file mặc định; tiếng Việt mang hậu tố `.vi.md`
  (`CASE_STUDY.md` / `CASE_STUDY.vi.md`). Chỉ dịch các cửa vào, không dịch tài liệu đặc tả bên trong.
- **`docs/` là CÁI GÌ & VÌ SAO; `directives/` là LÀM NHƯ THẾ NÀO.** Phần đặc tả và các ADR mô tả hệ
  thống; các directive là quy trình code mà mọi người đóng góp (người hay AI) đều phải tuân theo.
- **Mỗi scenario có đúng một quyết định chủ đạo**, được ghi thành ADR kèm những phương án nó đã loại
  bỏ. Một ADR không có phương án bị loại thì không phải ADR, mà chỉ là bản mô tả.
- **Một bảo đảm đúng đắn có test**, không phải demo đường hạnh phúc. Thường là tính chất về concurrency
  hoặc consistency — thứ khiến scenario đó không tầm thường ngay từ đầu.
- **Trạng thái trung thực.** Mỗi scenario nói rõ cái gì **chưa** được xây và điều kiện nào sẽ kích hoạt
  việc xây nó. Hoãn lại là một quyết định; thiếu sót là một tai nạn. Tài liệu phải nói rõ đó là cái nào.
- **Giữ lại thất bại, không cắt bỏ.** Chỗ nào một ghi chú thiết kế từng dự đoán sai, dự đoán sai đó
  được giữ nguyên kèm chú thích. Một repository chỉ toàn dự đoán đúng không phải bằng chứng của một
  quy trình — đó là bằng chứng của việc biên tập lại.
