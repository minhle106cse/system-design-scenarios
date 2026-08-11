# Case Study 01 · Service Appointment Scheduler (Đặt lịch bảo dưỡng xe)

**Đặt chỗ một tài nguyên dùng chung, có giới hạn, sao cho đúng khi nhiều người cùng yêu cầu tại cùng
một thời điểm.**

[🇬🇧 English](CASE_STUDY.md) · 🇻🇳 Tiếng Việt

> Đây là **cửa vào của scenario** — viết cho người muốn học từ nó, không phải cho người đi review đặc
> tả. Tài liệu trả lời bảy nhóm tiêu chí được định nghĩa trong
> [README của tuyển tập](../README.vi.md), và dẫn link sang các tài liệu đặc tả để xem chi tiết thay
> vì chép lại chúng.
>
> | Bạn muốn | Đi tới |
> |---|---|
> | Chạy thử | [`RUN.md`](RUN.md) |
> | Tài liệu thiết kế hệ thống chính thức | [`docs/03`](docs/03_system_architecture_diagrams.md) |
> | Quyết định quan trọng nhất | [`ADR-0002`](docs/adr/0002-booking-concurrency-control.md) |
> | Bản đồ yêu cầu → code → test | [`readme.md`](readme.md) |

---

# A · Nhận diện bài toán

## A.1 Tóm trong một câu

Cho một khách hàng, một chiếc xe, một loại dịch vụ, một đại lý và một thời điểm mong muốn, hãy xác
nhận lịch hẹn **chỉ khi** có một khoang sửa xe và một kỹ thuật viên *đủ trình độ cho đúng dịch vụ đó*
cùng rảnh trong **toàn bộ** thời lượng — và tuyệt đối không để hai lịch hẹn cùng giữ một khoang hoặc
một kỹ thuật viên ở những khoảng thời gian chồng lên nhau, dù có bao nhiêu request ập tới cùng lúc.

## A.2 Lĩnh vực

Bán lẻ ô tô, giai đoạn "Ownership" — phần vòng đời khách hàng **sau khi** xe đã bán: bảo dưỡng, bảo
trì, sửa chữa. Trong một chuỗi đại lý, đây thường là điểm chạm với khách có biên lợi nhuận cao nhất
và tần suất cao nhất.

## A.3 Nỗi đau ngoài đời thật

Một trung tâm dịch vụ không có hệ thống sẽ chạy bằng **sổ giấy hoặc một file Excel dùng chung**, cộng
với điện thoại. Nhân viên tư vấn nhận cuộc gọi, mở trang hôm nay ra, thấy "Khoang 2, 10:00 — trống",
ghi tên khách vào. Những gì quy trình đó **không** làm được:

| Kiểu hỏng | Thực tế xảy ra |
|---|---|
| **Hai nhân viên, một trang sổ** | Hai khách bị ghi vào cùng một khoang, cùng một giờ. Cả hai cùng đến lúc 10:00. Một người phải chờ cả tiếng hoặc bị mời về. |
| **Bỏ qua thời lượng** | Một ca chẩn đoán động cơ 90 phút bị nhét vào khe trống 30 phút. Mọi lịch phía sau trượt hết, và khách cuối ngày bị từ chối. |
| **Bỏ qua trình độ** | Xe đến để làm hộp số; kỹ thuật viên duy nhất đang trực chỉ đủ trình độ thay dầu. Khoang thì bị chiếm, mà khách thì không được phục vụ. |
| **Kỹ thuật viên bị đặt trùng giữa các khoang** | Khoang trống nên lịch "trông" ổn — nhưng người kỹ thuật viên duy nhất làm được việc đó đang chui dưới một chiếc xe khác ở khoang 3. |
| **Không có bản ghi** | Không phân biệt được khách không đến với việc mất lịch. Không có gì để phân tích, đối soát hay xuất hóa đơn. |

Mỗi tình huống trên đều là một lỗi về **năng lực phục vụ**, mà dưới mắt khách hàng thì nó đọc thành
sự thiếu chuyên nghiệp — và mỗi lỗi đều **vô hình ngay tại thời điểm đặt lịch**. Đó chính là lý do
cần một hệ thống, chứ không phải cần một nhân viên cẩn thận hơn.

## A.4 Ai gặp bài toán này

Trực tiếp:

- **Trung tâm dịch vụ ô tô và các chuỗi đại lý** — đúng như scenario mô tả.
- Bất kỳ ai bán **thời gian trên một lượng hữu hạn người có tay nghề cộng với trạm/thiết bị vật lý**.

Cùng một bài toán, đổi tên gọi:

| Ngành | "Khoang sửa" trở thành | "Kỹ thuật viên đủ trình độ" trở thành |
|---|---|---|
| Phòng khám / nha khoa | Phòng khám hoặc phòng mổ | Bác sĩ có chứng chỉ cho thủ thuật đó |
| Salon tóc / thẩm mỹ | Ghế hoặc bàn làm việc | Thợ được đào tạo cho liệu trình đó |
| Cho thuê thiết bị / xe | Chính thiết bị đó | Người vận hành có chứng chỉ, hoặc hạng bằng lái |
| Tòa án | Phòng xử | Thẩm phán được phân cho loại vụ án đó |
| Quản lý tòa nhà | Phòng họp | Thiết bị bắt buộc, hoặc kỹ thuật viên AV |
| Trung tâm dạy lái | Xe tập lái | Giáo viên được cấp phép cho hạng bằng đó |
| Phòng khám thú y | Phòng khám hoặc phòng mổ | Bác sĩ thú y đủ chuyên môn cho loài / thủ thuật đó |
| Sản xuất | Máy hoặc ô sản xuất | Công nhân có chứng chỉ vận hành máy đó |

Nếu bạn nói được câu *"chúng tôi có N cái này, chúng được đặt theo các khối thời gian, và không phải
ai cũng vận hành được tất cả"* — thì đây chính là bài toán của bạn, dù ngành bạn gọi nó bằng tên gì.

## A.5 Mức độ phổ biến · ★★★★★

Chấm theo tần suất bài toán xuất hiện trong **sản phẩm thật**, không theo độ nổi tiếng của nó trong
đề phỏng vấn.

- **Mọi sản phẩm đặt lịch từng được xây** đều chứa bài toán này ở lõi. Đó là lý do tồn tại của
  Calendly, OpenTable, Booksy, Zocdoc, Cal.com, và mọi hệ DMS của đại lý ô tô.
- Đây cũng là bài toán mà **phần lớn các bản tự triển khai nội bộ làm sai một cách tinh vi**, vì
  phiên bản sai vẫn vượt qua mọi bài test mà người ta nghĩ ra để viết (xem §C).
- Vượt ra ngoài việc đặt lịch: hình dạng cốt lõi — *"kiểm tra một điều kiện, rồi ghi, một cách nguyên
  tử, trước những người ghi đồng thời"* — chính là hình dạng của đặt chỗ ngồi, giữ hàng tồn kho, bán
  vé, rate limiting, và đăng ký username duy nhất.

Học nó một lần ở đây thì chuyển giao được sang tất cả những thứ trên.

## A.6 Các tên gọi khác

Bạn sẽ gặp lại bài toán này dưới tên: *resource-constrained scheduling* · *double-booking prevention*
· *multi-resource reservation* · *calendar conflict detection* · *interval scheduling with resource
constraints* · *the overbooking problem* · trong học thuật là một biến thể có ràng buộc của
*interval graph colouring*.

---

# B · Yêu cầu

## B.1 Yêu cầu chức năng — trích nguyên văn từ đề bài

Scenario này hiện thực *Scenario A: The Unified Service Scheduler* trong
[`KeyloopCodingChallange.pdf`](KeyloopCodingChallange.pdf):

> 1. **Resource Constrained Booking:** Allow a user to request a service appointment for a specific
>    vehicle, service type, and dealership at a desired time.
> 2. **Real-Time Availability Check:** Before confirming, check for the availability of both a
>    ServiceBay and a qualified Technician for the entire service duration.
> 3. **Confirmed Appointment Record:** Upon success, create a persistent Appointment record
>    associating the customer, vehicle, technician, and service bay.

Hai từ trong yêu cầu 2 gánh gần như toàn bộ độ khó, và cả hai đều rất dễ đọc lướt qua:

- **"qualified"** (đủ trình độ) — các kỹ thuật viên **không** thay thế được cho nhau. Điều này bắt
  buộc phải có mô hình nhiều-nhiều cho trình độ, và biến truy vấn tìm chỗ trống thành một tập đã lọc
  chứ không phải một phép đếm.
- **"entire service duration"** (toàn bộ thời lượng dịch vụ) — chỗ trống là chuyện của một **khoảng**,
  không phải một **thời điểm**. Một phép kiểm tra hỏi "khoang có trống lúc 10:00 không?" là sai; nó
  phải hỏi "khoang có trống suốt từ 10:00 đến 11:30 không?"

## B.2 Những gì đã xây

Bốn endpoint ([hợp đồng đầy đủ](docs/06_api_contracts.md)):

| Endpoint | Mục đích |
|---|---|
| `POST /api/v1/appointments` | Đặt lịch. **Server** chọn khoang và kỹ thuật viên — client không được chỉ định. |
| `GET /api/v1/availability` | Xem các khung giờ trống theo đại lý + loại dịch vụ + ngày. Trả về **số lượng**, không trả id. |
| `GET /api/v1/appointments/:id` | Đọc lại lịch hẹn — đây là thứ khiến bản ghi ở yêu cầu 3 trở nên quan sát được. |
| `POST /api/v1/appointments/:id/cancel` | Huỷ. Là chuyển trạng thái, không phải xoá; giải phóng khung giờ ngay lập tức. |

## B.3 Yêu cầu phi chức năng — và những gì thành thật là chưa đo

| Tính chất | Lập trường | Trạng thái trung thực |
|---|---|---|
| **Đúng đắn khi có đồng thời** | Điểm duy nhất không thương lượng. Được ép ở tầng database. | **Đã chứng minh** bằng test bắn hai request đặt lịch thật đồng thời ([`test:integration`](docs/08_testing_and_qa_strategy.md)) |
| **Tính nhất quán (consistency)** | Mạnh. Một instance Postgres, một transaction cho mỗi lần đặt, không có eventual consistency ở đâu cả. | Đúng theo thiết kế |
| **Độ trễ (latency)** | Đặt lịch là vài truy vấn có index cộng một lệnh insert, trong một transaction. | Có histogram (`scheduler_api_availability_check_duration_seconds`); **chưa chạy load test** — điều kiện kích hoạt việc đó ghi trong [ADR-0003 §4](docs/adr/0003-availability-and-selection-policy.md), và bịa ra một con số trước khi điều kiện đó xảy ra chỉ là diễn |
| **Khả năng mở rộng** | Phần tìm chỗ trống đọc khoang/kỹ thuật viên theo đại lý (vài chục) rồi lọc trong bộ nhớ. Ổn ở quy mô này; bản viết lại bằng raw SQL đã được thiết kế và hoãn kèm điều kiện kích hoạt. | Hoãn có chủ đích, không phải bỏ sót |
| **Tính sẵn sàng** | Một instance duy nhất, không HA. | Ngoài phạm vi, có nêu rõ |
| **Khả năng quan sát** | Log JSON có cấu trúc kèm tự động gắn trace, metric Prometheus, dashboard Grafana dựng sẵn bằng code. | Đã xây ([docs/03 §6](docs/03_system_architecture_diagrams.md)) |
| **Idempotency** | Một form đặt lịch bị bấm hai lần không được tạo ra hai lịch hẹn. | Đã xây, lưu ở Postgres, và **được test qua HTTP thật** |
| **Bảo mật / xác thực** | Không có. Ai cũng đặt lịch thay cho ai cũng được. | Cố ý ngoài phạm vi — xem B.5 |

## B.4 Những thứ cố ý KHÔNG làm

Nêu tên để "thiếu" không bao giờ bị nhầm với "hoãn":

- Không xác thực, phân quyền hay multi-tenancy — mọi caller đặt được lịch ở mọi đại lý.
- Không thanh toán, hoá đơn hay bảng giá.
- Không thông báo (email/SMS) — đây chính là điều kiện kinh điển để thêm message broker, và cái khe
  nối đó được ghi lại thay vì xây sẵn.
- Không có frontend. Đề bài yêu cầu làm **một** tầng cho trọn vẹn; đây là backend, với tầng client
  được stub bằng OpenAPI spec ở `/docs` và các ví dụ cURL.
- Không có endpoint liệt kê/tìm kiếm lịch hẹn — nó cần phân trang và một quyết định về index, mà
  không yêu cầu nào đòi hỏi.
- Không đổi lịch, và không có đường ghi trạng thái `COMPLETED` (nên một nhánh 409 trên thực tế không
  bao giờ chạm tới được — được ghi rõ thay vì giấu đi).

## B.5 Chỗ mơ hồ — nơi đề bài không nói

Đề bài nói rõ: *"Nếu một yêu cầu chưa rõ ràng, hãy đưa ra giả định hợp lý và ghi lại nó."* Đã ghi lại
mười sáu giả định ([bảng đầy đủ](docs/01_business_requirements.md#assumptions)). Những giả định đã
thay đổi thiết kế:

| Chỗ mơ hồ | Giả định | Hệ quả |
|---|---|---|
| Thế nào là kỹ thuật viên "đủ trình độ"? | Một bảng nối nhiều-nhiều `TechnicianServiceType` | Việc tìm chỗ trống trở thành truy vấn có lọc, không phải phép đếm. Dữ liệu seed cố ý cho các kỹ thuật viên **những** trình độ khác nhau để quy tắc này chứng minh được. |
| Thời gian liên tục, hay khe cố định? | **Liên tục**; thời lượng lấy từ `ServiceType.durationMinutes` | Bắt buộc dùng range type và `EXCLUDE` thay vì một unique index đơn giản trên id của khe. SQL khó hơn, nhưng khớp với thực tế nghiệp vụ hơn. |
| Ai chọn khoang và kỹ thuật viên — client hay server? | **Server**, một cách tất định (khoang trống đầu tiên theo nhãn, kỹ thuật viên trống đầu tiên theo tên) | Client không thể chọn tốt: nó sẽ phải đọc chỗ trống, chọn, rồi vẫn thua race như thường. Tính tất định cũng khiến demo và test tái lập được. |
| Đại lý mở cửa khi nào? | Là cấu hình (`BUSINESS_HOURS_*`, `BUSINESS_DAYS`, `BUSINESS_CLOSED_DATES`), một lịch chung cho mọi đại lý | Tránh phải tạo migration ngay cạnh các ràng buộc viết tay. Bản dùng bảng đã được thiết kế và hoãn kèm điều kiện kích hoạt. |
| `GET /availability` có phải là giữ chỗ không? | **Không.** Nó không khoá gì và không tạo ra gì. | Nên nó trả về **số lượng**, không trả id — một cái id sẽ đọc thành "cái này là của bạn", mà thực tế thì không. |
| Xe có bắt buộc thuộc về khách đặt không? | Có — ép trong handler (422) | Sơ đồ ERD khẳng định điều đó; còn database thì chỉ có hai khoá ngoại độc lập, không ràng buộc gì với nhau. |

---

# C · Vì sao nó khó

## C.1 Phép kiểm tra là một thao tác đọc, mà đọc thì không chặn được ghi

Toàn bộ bài toán nằm gọn trong một dòng thời gian. Hai khách, một khoang trống:

```
        Request A                          Request B
t=0     đọc: khoang 1 trống 10:00–11:00
t=1                                        đọc: khoang 1 trống 10:00–11:00
t=2     (quyết định: đặt khoang 1)         (quyết định: đặt khoang 1)
t=3     INSERT lịch hẹn khoang 1
t=4                                        INSERT lịch hẹn khoang 1
                                           ← cả hai đều thành công. Khoang 1 bị đặt trùng.
```

Cả hai request đều làm **đúng y hệt** những gì yêu cầu nói. Cả hai đều đã kiểm tra chỗ trống. Cả hai
đều đúng *tại thời điểm chúng kiểm tra*. Đây là **TOCTOU** — time-of-check to time-of-use — và nó là
hiểm hoạ định danh của scenario này.

## C.2 Vì sao những cách sửa hiển nhiên không ăn thua

**"Bọc nó trong một transaction."** Transaction cho bạn tính nguyên tử và sự cô lập với *công việc
của chính bạn*; ở mức mặc định `READ COMMITTED` của Postgres, nó **không** khiến thao tác đọc của bạn
chặn lệnh insert của người khác. Cả hai transaction đều commit vui vẻ. Nâng lên `SERIALIZABLE` thì
*có* bắt được — bằng cách huỷ một transaction với lỗi serialization mà bạn phải tự phát hiện và dịch
lại, tức là nhiều việc hơn hẳn so với một ràng buộc khai báo, và còn làm chậm mọi transaction không
liên quan khác.

**"Kiểm tra lại lần nữa ngay trước khi insert."** Cách này thu hẹp khe hở; nó không đóng khe hở lại.
Luôn luôn tồn tại một khoảng giữa lần đọc cuối cùng và lệnh ghi, và tính đồng thời không hề tôn trọng
việc hai dòng code trông gần nhau đến mức nào trong file nguồn.

**"Khoá cái khoang lại."** Giờ thì **mọi** người ghi đều phải nhớ lấy khoá — kể cả cái công cụ admin
viết vào năm sau, và cái script vá dữ liệu chạy lúc 2 giờ sáng. Bất biến (invariant) khi đó sống nhờ
một quy ước, mà quy ước thì không được ép buộc.

Đây là bài học tổng quát, và đáng nói thẳng ra:

> **Một bất biến mà mọi người ghi đều phải tự giác giữ, thì thực chất chẳng ai giữ cả.**
> Hãy đặt nó ở nơi không thể đi vòng qua — trong chính mô hình dữ liệu.

## C.3 Hậu quả nghiệp vụ khi làm sai

Không phải một vấn đề toàn vẹn dữ liệu trừu tượng. Hai khách hàng lái xe đến đại lý. Một trong hai bị
mời về, hoặc phải chờ một tiếng. Trung tâm dịch vụ mất một khung giờ đáng lẽ bán được, và mất một
khách hàng có thể không quay lại. Con bug thì im lặng trong database và **cực kỳ ồn ào ngoài bãi xe**.

Và điểm mấu chốt: **phiên bản sai vẫn qua được review.** Phép kiểm tra nằm ngay đó, cách lệnh insert
vài dòng. Đọc lên thấy đúng. Nó chỉ hỏng khi hai request đan xen vào nhau — điều mà không một unit
test nào với repository giả lập có thể tạo ra được.

## C.4 Độ khó · ★★★☆☆

Cái *insight* cốt lõi chỉ là một ràng buộc duy nhất, và một khi đã thấy thì thấy nó hiển nhiên. Thứ
đẩy nó lên mức giữa là: **không có gì trong đề bài mách cho bạn rằng cần tới insight đó** — bạn phải
sẵn có kiến thức rằng "kiểm-tra-rồi-hành-động" là một lớp hiểm hoạ, và biết rằng database của mình có
sẵn một câu trả lời khai báo cho nó. Xung quanh phần lõi đó, khối lượng công việc phụ trợ tử tế (giờ
làm việc đúng cả khi đổi giờ DST, lọc theo trình độ, idempotency, phân loại lỗi) thì bình thường
nhưng rộng.

---

# D · Thiết kế

## D.1 Kiến trúc

```
Client (cURL / client sinh từ OpenAPI)
   │  REST + X-Idempotency-Key
   ▼
Tầng HTTP ── TraceContext → ZodValidationPipe → Controller → IdempotencyInterceptor
   ▼
CQRS bus ─── CommandBus (log → retry → transaction → handler)   ghi
             QueryBus   (không transaction)                      đọc
   ▼
Domain ─────  Appointment entity · business-hours · resource-selection   (TypeScript thuần)
   ▼
Repository    một bộ write-repo cho mỗi transaction (Unit of Work)
   ▼
PostgreSQL ── các bảng + CÁC EXCLUSION CONSTRAINT  ← bảo đảm nằm ở ĐÂY
```

Sơ đồ đầy đủ và vai trò từng thành phần: [`docs/03`](docs/03_system_architecture_diagrams.md).

## D.2 Mô hình dữ liệu

Chín bảng. Vì sao cần từng bảng:

| Bảng | Lý do tồn tại |
|---|---|
| `Customer`, `Vehicle` | "chiếc xe cụ thể" ở yêu cầu 1; `Vehicle.customerId` cho quy tắc sở hữu một thứ để kiểm tra |
| `Dealership` | "đại lý" ở yêu cầu 1. Khoang và kỹ thuật viên thuộc về đúng một đại lý |
| `ServiceType` | Mang `durationMinutes` — **đây là thứ biến một thời điểm bắt đầu thành một khoảng thời gian** |
| `ServiceBay` | Tài nguyên vật lý bị giới hạn |
| `Technician` | Tài nguyên con người bị giới hạn |
| `TechnicianServiceType` | Bảng nối khiến chữ "**đủ trình độ**" có nghĩa và kiểm tra được |
| `Appointment` | Bản ghi ở yêu cầu 3: đủ bốn liên kết + khoảng thời gian + trạng thái |
| `IdempotencyRecord` | Khiến form bị bấm hai lần trở nên an toàn — lưu trong Postgres, nên không cần Redis |

Quy ước: khoá chính UUID (không bao giờ dùng `autoincrement`), `camelCase` trong code ánh xạ sang cột
`snake_case`, xoá mềm bằng `deletedAt`. ERD đầy đủ: [`docs/04`](docs/04_database_schema.md).

## D.3 Quyết định chủ đạo — ràng buộc loại trừ ở tầng database

Trích thẳng từ migration ([đọc tại đây](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql)):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_service_bay_no_overlap"
  EXCLUDE USING gist (
    "service_bay_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'SCHEDULED'::"AppointmentStatus" AND "deleted_at" IS NULL);
```

…và một ràng buộc thứ hai y hệt, khoá theo `technician_id`.

Đọc nó như một câu: **không được tồn tại hai dòng mà khoang thì giống nhau (`WITH =`) *và* khoảng thời
gian thì chồng lên nhau (`WITH &&`)** — chỉ xét những dòng đang `SCHEDULED` và chưa bị xoá mềm.

Bốn chi tiết đáng hiểu, vì mỗi cái đều là một quyết định:

1. **`EXCLUDE USING gist`** — bản tổng quát hoá của `UNIQUE`. `UNIQUE` từ chối một dòng khi một cột
   *bằng* với dòng đã có; `EXCLUDE` cho phép bạn chọn **toán tử** cho từng cột. Ở đây: dấu bằng cho
   khoang, **chồng lấn** (`&&`) cho khoảng thời gian. Đây chính là thứ mà unique index không diễn đạt
   được.
2. **`btree_gist`** — index GiST xử lý được chồng lấn khoảng nhưng không xử lý được so sánh bằng trên
   kiểu vô hướng. Extension này bổ sung hỗ trợ `=` để cả hai vế cùng nằm trong một index. Thiếu nó,
   ràng buộc sẽ không tạo được.
3. **`'[)'` — khoảng nửa mở.** `end_at` là **loại trừ**. Một lịch hẹn kết thúc lúc 11:00 và một lịch
   bắt đầu lúc 11:00 **không** chồng lấn. Điều này khớp với cách con người đọc "10–11" rồi "11–12", và
   nó được test riêng. Làm sai chỗ này thì mọi lịch hẹn liền kề nhau đều bị từ chối.
4. **Mệnh đề `WHERE` một phần** — lịch đã huỷ thôi không tham gia vào ràng buộc nữa, nên việc huỷ giải
   phóng khung giờ **ngay lập tức**, không cần job dọn dẹp. Các dòng bị xoá mềm cũng rớt ra, giữ cho
   góc nhìn của database và góc nhìn của ứng dụng về "những dòng nào đang tồn tại" là như nhau.

**Prisma không diễn đạt được cái này.** Migration được sinh bằng `--create-only` rồi khối lệnh trên
được thêm bằng tay, sau đó commit. Đây cũng là lý do `prisma db push` là không đủ cho dự án này, và
lý do migration khởi tạo được coi là bất biến.

## D.4 Năm phương án thay thế, và vì sao từng cái bị loại

Trích từ [ADR-0002 §4](docs/adr/0002-booking-concurrency-control.md) — một ADR không có phương án bị
loại thì không phải ADR:

| Phương án | Vì sao bị loại |
|---|---|
| **Chỉ kiểm tra ở tầng ứng dụng** | Không đóng được race (§C.1). Đây là cách phổ biến nhất khiến đúng con bug này lọt lên production — code đã review trông có vẻ đúng vì phép kiểm tra nằm ngay trên lệnh ghi. |
| **Optimistic concurrency (cột `version`)** | OCC bảo vệ các lệnh ghi đồng thời lên **cùng một dòng**. Còn hiểm hoạ ở đây nằm giữa **hai dòng mới khác nhau**; OCC không có gì để đối chiếu trước khi insert. Sai công cụ cho hình dạng xung đột này. |
| **Distributed lock (Redis `SETNX`)** | Chạy được, nhưng thêm một phụ thuộc ngoài mà dự án vốn không cần, cho một bảo đảm mà Postgres đã hỗ trợ sẵn — và chỉ bảo vệ được những caller nhớ lấy khoá. |
| **`SELECT … FOR UPDATE`** | Bạn phải khoá đúng những dòng cần khoá *trước khi dòng gây xung đột tồn tại*. Rất khó làm cho đúng, và vẫn chỉ bảo vệ những người ghi biết khoá theo đúng thứ tự. |
| **Khe cố định + unique index** | SQL đơn giản hơn, nhưng ép mọi thời lượng phải là bội số của kích thước khe và gây lãng phí năng lực phục vụ. Khoảng liên tục khớp nghiệp vụ hơn; Postgres khiến bản "khó hơn" thực ra không khó bảo trì hơn. |

## D.5 Những quyết định khác đáng học theo

- **Vẫn giữ phép kiểm tra ở tầng ứng dụng** — không phải để đảm bảo đúng đắn, mà để có *thông báo lỗi
  tốt*. Nó phân biệt sáu lý do từ chối (`no_service_bay_at_dealership`, `no_free_service_bay`,
  `service_bay_taken_concurrently`, …). "Cửa hàng kín lịch" và "bạn vừa thua race, thử lại ngay" đòi
  hỏi hai phản ứng trái ngược nhau từ phía client.
- **Xung đột khung giờ không bao giờ được tự động retry**
  ([ADR-0003 §2.4](docs/adr/0003-availability-and-selection-policy.md)). Chỉ những lỗi DB thoáng qua
  (`P2034`) mới được retry. Một khung giờ đã bị chiếm thì vẫn cứ bị chiếm; retry chỉ tạo ra đúng thất
  bại đó nhưng chậm hơn. Lỗi này cố ý **không** mang cờ `transient: true`.
- **Idempotency theo kiểu claim-before-execute, trong Postgres.** Dòng khoá được insert **trước khi**
  handler chạy, nên một request trùng chạy song song sẽ hoặc thấy response đã hoàn tất (phát lại),
  hoặc thấy một claim đang xử lý (409) — nó không bao giờ chạm được vào handler lần thứ hai. Không cần
  Redis.
- **Phần tìm chỗ trống trả về số lượng, không trả id** — nó là một phép chiếu, không phải một lần giữ
  chỗ.
- **Giờ làm việc là cấu hình, không phải bảng** — cho ra đúng bản demo đó với rủi ro schema bằng
  không, ngay cạnh những ràng buộc viết tay. Bản dùng bảng đã được thiết kế và hoãn kèm điều kiện.

## D.6 Công nghệ, và lý do

| Lựa chọn | Lý do |
|---|---|
| **PostgreSQL** | Bảo đảm chủ đạo **bắt buộc** cần range type và exclusion constraint. Không phải database nào cũng diễn đạt được điều này một cách khai báo — đây là trường hợp lựa chọn database bị dẫn dắt bởi một yêu cầu về tính đúng đắn, chứ không phải bởi sở thích. |
| **Prisma** | Truy vấn an toàn kiểu và migration có phiên bản — kèm nhận thức, được nói rõ ở đây, rằng DSL của nó không phủ hết mọi tính năng Postgres, và có đúng một ngoại lệ viết tay. |
| **NestJS + Fastify** | DI và hệ module cho phần dây nối CQRS cùng các ranh giới hexagonal (được ép bằng lint) một chỗ đứng tự nhiên; chọn Fastify vì overhead thấp hơn. |
| **CQRS + Unit of Work** | Biến ranh giới transaction thành **cấu trúc** thay vì một kỷ luật phải nhớ ([ADR-0001](docs/adr/0001-transaction-retry-boundary.md)) — điều này quan trọng khi yêu cầu cốt lõi chính là một bảo đảm về concurrency. |
| **Zod, theo từng route** | Một thư viện validation duy nhất, áp dụng tường minh. Các schema OpenAPI được *sinh ra từ chính những schema mà API dùng để validate*, nên hợp đồng công bố không thể lệch khỏi hợp đồng được thực thi. |
| **Không Redis, không Kafka** | Cả hai đều chưa xứng đáng có mặt. Cả hai khe nối đều được ghi lại kèm điều kiện kích hoạt. |

---

# E · Tính đúng đắn

## E.1 Cần chứng minh điều gì

Một câu: **hai lần đặt lịch đồng thời cho cùng một khoang và cùng một khung giờ phải tạo ra đúng một
lịch hẹn.** Mọi thứ khác đều bình thường; đây mới là tính chất mà sản phẩm này tồn tại **vì** nó.

## E.2 Ba tầng test, mỗi tầng chứng minh thứ hai tầng kia về cấu trúc không thể chứng minh

Tổng cộng 187 test, chia ba bộ đi vào hệ thống ở ba độ sâu khác nhau — có chủ đích, không phải ngẫu
nhiên:

| Bộ test | Đi vào ở | Số lượng | Chứng minh | Về cấu trúc **không thể** chứng minh |
|---|---|---|---|---|
| **Unit** (`npm test`) | tầng class, repository giả lập | 172 | Logic nhánh, thứ tự chọn tài nguyên, giờ làm việc đúng cả khi đổi DST, mọi đường từ chối | Bất cứ điều gì về database — mock không thể thay thế một ràng buộc |
| **Integration** (`test:integration`) | `CommandBus`, **dưới** tầng HTTP | 3 | **Chính bảo đảm đó.** Hai command thật chạy đồng thời → transaction thật → Postgres thật; đúng một cái thắng, với đúng loại lỗi, và còn lại đúng một dòng | Bất cứ điều gì về hợp đồng HTTP |
| **E2E** (`test:e2e`) | tầng socket, qua `app.inject()` | 12 | Hợp đồng đã công bố: mã trạng thái, phong bì lỗi, Zod từ chối, phát lại idempotent | Tính đồng thời (nó chạy tuần tự, theo thiết kế) |

Bộ integration cố ý đi vào **dưới** HTTP: để không có gì thuộc về controller hay serialization có thể
được viện ra nhằm giải thích khác đi kết quả của nó.

## E.3 Từng tầng thực sự bắt được gì — lỗi thật, không phải giả định

Đây là phần đáng đọc nhất, vì nó ít đẹp đẽ nhất:

- Sau khi giai đoạn domain đã vượt **mọi cổng kiểm tra với 92 test xanh**, một đợt tự công kích có
  chủ đích vẫn tìm ra: một id gõ sai trả về **500** thay vì 404; một đại lý không tồn tại bị báo là
  `409 no_free_service_bay` — mã mà hợp đồng định nghĩa là "mọi khoang đều bận"; và **không có một
  tham chiếu thời gian nào trong toàn bộ module**, nên một lịch hẹn cho năm 2020 vẫn được chấp nhận.
- Một đợt rà soát sau đó phát hiện `GET /availability` trả về **`200 {"availableSlots": []}`** cho một
  đại lý không tồn tại — không phân biệt được với "kín lịch", trong khi `POST` trả 404 cho đúng id đó.
  Cùng một lớp lỗi, đã sửa ở đường ghi nhưng bỏ sót ở đường đọc, vì *"không có kết quả"* cũng là một
  câu trả lời hợp lệ nên nó che giấu bug rất giỏi.
- **Bài test đầu tiên trong đời đi qua một socket thật đã đỏ ngay lập tức**: response của idempotency
  được lưu theo kiểu bắn-rồi-quên, nên client retry sớm đọc phải `null` và nhận `409 đang xử lý` cho
  một request **đã thành công rồi**. Unit test thì khẳng định lệnh ghi *đã được gọi* — đúng là có gọi.
  Thử tay bằng cURL cũng qua, vì con người gõ lại chậm hơn tốc độ lệnh ghi kịp commit.
- Một `duration_minutes = 0` sẽ khiến `tstzrange(start, start)` trở thành **rỗng** — mà một khoảng
  rỗng thì không chồng lấn với bất cứ gì, tức là **âm thầm vô hiệu hoá cả hai** exclusion constraint
  cho loại dịch vụ đó. Đã sửa bằng `CHECK (duration_minutes > 0)`, đặt ở database, vì handler không
  phải người ghi duy nhất.

## E.4 Những gì test không chứng minh được

- Rằng các bài test đã đặt đúng câu hỏi. Mọi lỗi ở trên đều sống trong code có test xanh; thứ tìm ra
  chúng là một đợt công kích có chủ đích vào công việc **đã hoàn thành**, không phải bộ test.
- Hành vi dưới tải thật — chưa chạy load test nào, và tài liệu nói thẳng điều đó thay vì ám chỉ một
  con số.
- Rằng phần triển khai là đúng: workflow CI đã được rà soát về cấu trúc và từng bước đã tái lập ở
  máy local, nhưng **nó chưa từng chạy trên runner** (không có remote). Có nêu rõ, không tô vẽ.

---

# F · Giá trị học tập

## F.1 Các khái niệm, và xem từng cái ở đâu

| Khái niệm | Ở đâu |
|---|---|
| Exclusion constraint, GiST, `btree_gist` của PostgreSQL | [migration khởi tạo](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql) |
| Range type và ngữ nghĩa khoảng nửa mở | cùng file đó, cộng `business-hours.ts` |
| Hiểm hoạ TOCTOU / kiểm-tra-rồi-hành-động | [ADR-0002](docs/adr/0002-booking-concurrency-control.md) |
| Tách lệnh/truy vấn theo CQRS | `shared-kernel/src/cqrs/` |
| Unit of Work như một **giá trị**, không phải một cờ | [ADR-0001](docs/adr/0001-transaction-retry-boundary.md) |
| Phân tầng hexagonal, **ép bằng lint** | `apps/scheduler-api/eslint.config.mjs` |
| Idempotency không cần Redis (claim-before-execute) | `infrastructure/http/idempotency/` |
| Phân loại retry — cái gì được và không được retry | `resilience/prisma-transient-error.ts` |
| Xử lý thời gian đúng cả khi đổi DST bằng `Intl`, không dùng thư viện date | `domain/services/business-hours.ts` |
| Zod làm nguồn duy nhất cho **cả** validation **lẫn** OpenAPI | `presentation/schemas/responses.schema.ts` |
| Log có cấu trúc kèm tự động gắn trace | `directives/logging_standard.md` |
| Phân tầng test như một quyết định thiết kế | [`docs/08`](docs/08_testing_and_qa_strategy.md) |

## F.2 Kiến thức cần có trước

**Bắt buộc:** SQL và mô hình hoá quan hệ; transaction cơ bản và hiểu "nhiều request đồng thời" nghĩa
là gì; TypeScript; REST.
**Có thì tốt, không bắt buộc:** NestJS, Prisma, CQRS, Docker. Mỗi thứ đều được giải thích ngay chỗ nó
xuất hiện.
**Không cần:** hệ phân tán, Kafka, Kubernetes — cố ý, không có thứ nào trong số đó ở đây.

## F.3 Thời gian

| Mục tiêu | Ước lượng |
|---|---|
| Hiểu ý tưởng cốt lõi | ~15 phút (tài liệu này, §C và §D.3) |
| Đọc kỹ phần thiết kế | ~1 tiếng (`docs/03` + ADR-0002 + ADR-0003) |
| Chạy thử và tận mắt thấy bảo đảm hoạt động | ~30 phút (`RUN.md` → `test:integration`) |
| Tự dựng lại từ đầu | 2–4 ngày cho phần lõi; phần chỉn chu bao quanh (observability, phân loại lỗi, ba tầng test, tài liệu) mới là thứ kéo nó thành một tuần |

## F.4 Những cái bẫy — nơi người ta thực sự làm sai

1. **Tin vào phép kiểm tra ở tầng ứng dụng.** Kiểu hỏng phổ biến nhất. Nó trông đúng khi review.
2. **Kiểm tra một thời điểm thay vì một khoảng.** "10:00 có trống không?" không phải là "10:00–11:30
   có trống không?"
3. **Dùng khoảng đóng.** Dùng `'[]'` khiến các lịch liền kề nhau đâm vào nhau, và bạn sẽ "sửa" nó bằng
   cách trừ đi một phút ở đâu đó — một con bug bạn sẽ vác theo mãi mãi.
4. **Quên `btree_gist`.** Ràng buộc sẽ đơn giản là không tạo được, kèm một thông báo lỗi chẳng chỉ rõ
   ràng gì về chuyện thiếu extension.
5. **Thời lượng bằng 0 hoặc âm.** Một khoảng rỗng không chồng lấn với gì cả, nên nó âm thầm **vô hiệu
   hoá** ràng buộc của bạn. Hãy ép ở database, không phải ở handler.
6. **Tự động retry một xung đột thật.** Khung giờ đã bị chiếm thì vẫn bị chiếm; retry chỉ tốn thời
   gian và che mất tín hiệu mà client cần.
7. **Khiến một id gõ sai trông giống vấn đề hết chỗ.** `404` và "chúng tôi kín lịch" đòi hỏi hai phản
   ứng trái ngược từ phía người gọi.
8. **Không đọc lại được bản ghi.** Yêu cầu 3 nói "bản ghi bền vững"; không có endpoint đọc thì nó bền
   vững nhưng vô hình.
9. **Cho rằng test xanh nghĩa là đúng.** Mọi lỗi ở §E.3 đều từng sống chung với những bài test đang
   xanh.

## F.5 Liên quan tới phỏng vấn

Dùng lại được ngay khi được hỏi thiết kế: hệ thống **đặt bàn nhà hàng / đặt phòng khách sạn / đặt vé
máy bay**, hệ thống **bán vé**, ứng dụng **đặt lịch khám bệnh**, app **đặt phòng họp**, hệ thống **bãi
đỗ xe** — hoặc khi bị hỏi thẳng câu hỏi nền: *"làm sao bạn ngăn double-booking?"*

Câu trả lời ăn điểm không phải là "dùng transaction". Mà là: *"phép kiểm tra là một thao tác đọc, nên
nó bị race. Tôi sẽ đặt bất biến đó vào database — nơi không thể đi vòng qua — bằng một exclusion
constraint trên (tài nguyên, khoảng thời gian) — và chỉ giữ phép kiểm tra ở tầng ứng dụng để sinh ra
thông báo lỗi tử tế."* Rồi kể tên các phương án thay thế và lý do bạn loại từng cái
([§D.4](#d4-năm-phương-án-thay-thế-và-vì-sao-từng-cái-bị-loại)).

---

# G · Tiến hóa

## G.1 Khi quy mô gấp 10 lần và 100 lần

| Quy mô | Cái hỏng đầu tiên | Cách sửa, đã thiết kế sẵn |
|---|---|---|
| **10×** (hàng trăm khoang/kỹ thuật viên) | `GET /availability` nạp toàn bộ khoang + kỹ thuật viên + lịch hẹn trong ngày rồi lọc trong bộ nhớ | Thay bằng một truy vấn `NOT EXISTS` / `tstzrange &&` — index GiST mà ràng buộc đã tạo sẵn hỗ trợ đúng truy vấn này. Vị từ chồng lấn được viết y hệt nhau ở cả hai chỗ, nên việc viết lại là thao tác máy móc ([ADR-0003 §4](docs/adr/0003-availability-and-selection-policy.md)) |
| **10×** (nhiều đại lý, giờ giấc khác nhau) | Một cấu hình `BUSINESS_HOURS_*` dùng chung cho tất cả | Một bảng `DealershipOpeningHours` — hoãn vì nó tốn một migration ngay cạnh các ràng buộc viết tay |
| **100×** (tranh chấp ghi trên các khung giờ hot) | Tỉ lệ xung đột tăng; mỗi kẻ thua đốt một transaction | Chọn tài nguyên theo kiểu cân tải thay vì luôn lấp đầy khoang có thứ tự thấp nhất. Metric báo hiệu đã có sẵn: `scheduler_api_booking_attempt_total{outcome="*_taken_concurrently"}` tăng lên trong khi các khoang khác ngồi chơi |
| **100×** (đa vùng địa lý) | Một Postgres duy nhất thành nút thắt, và ràng buộc chỉ có phạm vi trong một instance | Thật sự khó. Phân mảnh theo đại lý — tài nguyên không bao giờ trải qua nhiều đại lý — để mỗi shard giữ bảo đảm cục bộ của riêng nó. Tính nhất quán mạnh xuyên vùng cho bất biến này không phải thứ nên nói cho qua chuyện. |

## G.2 Những gì đã hoãn, kèm điều kiện kích hoạt

Mỗi mục dưới đây là một **quyết định**, được ghi lại kèm điều kiện sẽ đảo ngược nó
([bảng đầy đủ](docs/03_system_architecture_diagrams.md)):

| Năng lực | Điều kiện kích hoạt |
|---|---|
| Transactional outbox + message broker | Yêu cầu đầu tiên về công việc bất đồng bộ phải sống sót qua request — thông báo xác nhận lịch hẹn |
| Circuit breaker | Lời gọi đồng bộ đầu tiên tới một thứ service này không sở hữu (một DMS, một cổng thanh toán) |
| Rate limiting | Triển khai ra công khai, hoặc quan sát thấy lạm dụng |
| RBAC / multi-tenancy | Một triển khai đa đại lý thật, nơi nhóm này không được thấy dữ liệu nhóm kia |
| Liệt kê/tìm kiếm lịch hẹn | Một màn hình client thật liệt kê lịch hẹn của một khách hàng |
| Truy vấn chỗ trống bằng raw SQL | Hàng trăm tài nguyên mỗi đại lý, hoặc endpoint này lọt vào một ngân sách latency |

Điểm mấu chốt của danh sách này là: **mỗi năng lực đều đã được hiểu và xếp thứ tự, chứ không bị bỏ
quên**. Ship hạ tầng không dùng đến thì chỉ là bắt chước kiến trúc doanh nghiệp; nêu tên điều kiện
kích hoạt mới chứng tỏ hiểu khi nào từng mảnh trở nên cần thiết.

## G.3 Tự mở rộng scenario này

Những bài tập tốt, xếp đại khái theo độ khó tăng dần:

1. **Đổi lịch (reschedule)** — dời một lịch hẹn. Lưu ý đây là một lệnh update chạm vào chính ràng buộc
   đó; hãy nghĩ xem chuyện gì xảy ra với khung giờ cũ.
2. **Đường ghi trạng thái `COMPLETED`** — một luồng check-in/check-out. Việc này khiến một nhánh 409
   hiện đang không chạm tới được trở nên chạm tới được.
3. **Thời gian đệm giữa các lịch hẹn** — 15 phút để dọn khoang. Nó thuộc về đâu: khoảng thời gian, hay
   thời lượng dịch vụ?
4. **Ca làm của kỹ thuật viên** — một kỹ thuật viên chỉ rảnh 08:00–16:00, không phải toàn bộ giờ làm
   việc. Điều đó làm truy vấn tìm chỗ trống thay đổi thế nào?
5. **Chính sách overbooking** — cố ý cho phép vượt N% năng lực, như các hãng bay vẫn làm. Bạn phải từ
   bỏ bảo đảm nào, và ràng buộc còn giúp được gì không?

---

## Đi tiếp ở đâu

| | |
|---|---|
| **Chạy thử** | [`RUN.md`](RUN.md) |
| **Tài liệu thiết kế hệ thống** | [`docs/03_system_architecture_diagrams.md`](docs/03_system_architecture_diagrams.md) |
| **Quyết định chủ đạo, đầy đủ** | [`docs/adr/0002-booking-concurrency-control.md`](docs/adr/0002-booking-concurrency-control.md) |
| **Quá trình build có AI hỗ trợ được định hướng và kiểm chứng ra sao** | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) |
| **Quay lại tuyển tập** | [`../README.vi.md`](../README.vi.md) |
