# Case Study 02 · Demand-Driven Staff Scheduler (Lên lịch nhân viên theo nhu cầu)

**Biến số liệu giao dịch lịch sử thành một lịch làm việc công bằng cho cả tuần — một bài toán phân
bổ có ràng buộc, không có đáp án đúng duy nhất, chứ không phải một app CRUD gắn thêm một cái nút.**

[🇬🇧 English](CASE_STUDY.md) · 🇻🇳 Tiếng Việt

> Đây là **cửa vào của scenario** — viết cho người muốn học từ nó, không phải cho người đi review đặc
> tả. Tài liệu trả lời bảy nhóm tiêu chí được định nghĩa trong
> các tiêu chí của chính tuyển tập, và dẫn link sang các tài liệu đặc tả để xem chi tiết thay
> vì chép lại chúng.
>
> | Bạn muốn | Đi tới |
> |---|---|
> | Chạy thử | [`RUN.md`](RUN.md) |
> | Tài liệu thiết kế hệ thống chính thức | [`docs/03_architecture.md`](docs/03_architecture.md) |
> | Quyết định quan trọng nhất | [`ADR-0001`](docs/adr/0001-constraint-enforcement-strategy.md) |
> | Bản đồ yêu cầu → code → test | [`readme.md`](readme.md) |

---

# A · Nhận diện bài toán

## A.1 Tóm trong một câu

Cho một tuần dữ liệu giao dịch theo giờ trong quá khứ và một danh sách nhân viên, mỗi người có một
mức trần giờ làm/tuần, hãy soạn ra lịch phân ca cho cả tuần sao cho **không ai vượt trần giờ làm hay
làm hai ca chồng giờ trong cùng một ngày**, giờ cao điểm được phủ nhiều nhân viên hơn giờ vắng khách,
và không ai gần như rảnh rỗi trong khi người khác thì kín giờ tối đa — biết trước rằng không có một
lịch "đúng" duy nhất để hội tụ về, chỉ có một lịch đủ lý lẽ để bảo vệ.

## A.2 Lĩnh vực

Vận hành nhân sự trong bán lẻ và dịch vụ — phần việc quản lý một cửa hàng, quán cà phê, tổng đài hay
kho hàng không bao giờ ngừng là một bài toán con người: ai làm lúc nào, trong khi nhu cầu không bằng
phẳng và con người thì không thể hoán đổi cho nhau.

## A.3 Nỗi đau ngoài đời thật

Không có hệ thống, đây là một file Excel mà quản lý dựng lại bằng tay mỗi tuần, từ trí nhớ và cảm
tính "thứ Sáu thường đông". Những gì quy trình đó **không** làm được:

| Kiểu hỏng | Thực tế xảy ra |
|---|---|
| **Giờ cao điểm bị thiếu người** | Quản lý nhớ đợt cao điểm tháng trước, không nhớ đúng mô hình theo giờ của tuần này, nên 1 giờ chiều thứ Sáu — giờ đông khách nhất thật sự trong bộ dữ liệu dùng ở đây — vẫn được xếp số người y hệt 1 giờ chiều thứ Ba. |
| **Giờ vắng khách bị thừa người** | Không ai muốn là người cắt bớt ca của đồng nghiệp, nên lựa chọn an toàn là xếp mọi người theo giờ quen thuộc, bất kể 10 giờ tối cần ba người hay chỉ một. |
| **Phân bổ giờ không công bằng** | Ai được quản lý xếp trước, hoặc hỏi trước, sẽ có giờ đẹp. Không có cơ chế nào buộc phải nhìn công bằng vào mức sử dụng giờ của từng người — một nhân viên bán thời gian có thể chỉ đạt 20% trần giờ nhiều tuần liền mà không ai để ý, vì không có gì đo lường điều đó. |
| **Trần giờ chỉ là một lời khẳng định, không phải một đảm bảo** | Ai đó bị xếp 45 giờ trong khi hợp đồng chỉ 40 giờ, vì quản lý thêm một ca nữa mà không cộng lại cả tuần bằng tay. |
| **Không có bản ghi lý do "vì sao"** | Khi một ca cuối cùng bị thiếu người, không có dấu vết cho biết đó là một đánh đổi có chủ đích (không đủ giờ nhân viên để chia) hay chỉ là một sai sót. Tuần sau lặp lại y hệt. |

Mỗi lỗi trên đều **im lặng** trên một file Excel — không có gì báo đỏ cho tới khi khách hàng nhận ra
hàng chờ, hoặc nhân viên nhận ra tờ lương.

## A.4 Ai gặp bài toán này

Trực tiếp:

- **Bất kỳ doanh nghiệp bán lẻ/dịch vụ nào trả lương theo giờ** — đúng như scenario mô tả, dùng bộ
  dữ liệu giao dịch thật từ một cửa hàng vật lý.
- Bất kỳ ai cần chuyển **một tín hiệu nhu cầu đo được thành số người cần, rồi thành ca làm việc**.

Cùng một bài toán, đổi tên gọi:

| Ngành | "Số giao dịch" trở thành | "Ca làm" trở thành |
|---|---|---|
| Tổng đài | Số cuộc gọi/giờ | Một khối giờ trực của agent |
| Nhà hàng | Số lượt khách/giờ | Ca phục vụ / ca bếp |
| Kho vận / fulfillment | Số đơn hàng/giờ | Một ca pick-pack |
| Khoa bệnh viện (nhân sự phi lâm sàng) | Số bệnh nhân/giờ | Một ca điều dưỡng |
| Gọi xe / giao hàng | Số yêu cầu chuyến/giờ | Khung giờ hoạt động của tài xế |
| Giao thông công cộng | Lượng khách/giờ | Ca lái xe/soát vé |

Nếu bạn có thể nói *"chúng tôi có một đường cong nhu cầu biến động theo giờ, và những người chỉ có
thể làm một số giờ nhất định mỗi tuần"* — thì đây chính là bài toán của bạn, dù ngành của bạn gọi nó
là gì.

## A.5 Mức độ phổ biến · ★★★★★

- **Mọi doanh nghiệp bán lẻ/dịch vụ trả lương theo giờ đều làm việc này, mỗi tuần**, thường trên một
  file Excel hoặc bảng trắng — đây là một trong những bài toán chưa được phần mềm hóa phổ biến nhất ở
  các doanh nghiệp nhỏ và vừa, không phải một nhu cầu chuyên biệt hiếm gặp.
- Đây cũng là bài toán mà hầu hết các file Excel tự làm đều **âm thầm sai** — một lịch không công
  bằng hay một giờ cao điểm thiếu người không hề báo lỗi, nó chỉ âm thầm tốn doanh thu hoặc tinh thần
  (§C).
- Ngoài bán lẻ: bản chất bài toán — *"chuyển một tín hiệu nhu cầu thành số người cần, rồi thỏa mãn
  các ràng buộc cứng và mềm cạnh tranh nhau trên một nhóm người hữu hạn"* — cùng hình dạng với xếp
  lịch điều dưỡng, quản lý nhân lực tổng đài, và xếp lịch phi hành đoàn hàng không (đều là những
  phiên bản nổi tiếng khó hơn nhiều của cùng một bài toán gốc).

## A.6 Các tên gọi khác

Bạn sẽ gặp bài toán này dưới các tên: *workforce scheduling* · *shift scheduling* · *staff
rostering* · *labor demand planning* · *employee scheduling optimization* · trong học thuật, một
biến thể có ràng buộc của *Nurse Rostering Problem* — một họ bài toán tối ưu tổ hợp nổi tiếng
NP-hard mà scenario này cố tình không cố giải chính xác (§D.4).

---

# B · Yêu cầu

## B.1 Yêu cầu chức năng — trích nguyên văn từ đề bài

Scenario này hiện thực đề bài
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](SWE_Take-Home_Staff_Scheduling_System.pdf), trích dẫn
đầy đủ cùng mọi giả định đã ghi lại tại
[`docs/01_business_requirements.md`](docs/01_business_requirements.md):

> 2.1 **Tạo một schedule.** Vật chứa cấp cao nhất cho nhân viên, giao dịch, ca làm và lịch được tạo
> ra.
> 2.2 **Thêm nhân viên và số giờ làm tối đa/tuần.** Thêm, sửa, xóa.
> 2.3 **Tải lên dữ liệu giao dịch (nhu cầu)**, import từ file CSV đề bài cung cấp.
> 2.4 **Định nghĩa ca làm** — chỉ gồm giờ bắt đầu và giờ kết thúc. Gieo sẵn hai ca mặc định:
> 07:00–15:00 và 15:00–23:00. Thêm, sửa, xóa.
> 2.5 **Auto-schedule.** Một nút bấm soạn ra một lịch tuần hợp lý: giờ đông khách được phủ nhiều nhân
> viên hơn, mọi mức trần giờ/tuần của nhân viên được tôn trọng, và *"một lượng công việc công bằng,
> hữu ích — không ai bị xếp 0 giờ hoặc gần như 0 giờ trong khi người khác thì kín tối đa."*
> 2.6 **Màn hình tổng hợp** — theo từng ô và bốn tổng số cấp tuần, gồm hai chỉ số giao dịch/giờ-nhân-
> viên *"có thể khác nhau [giữa hai chỉ số]; hiển thị cả hai."*

Và về chính thuật toán (đề bài §4): *"Đây là trái tim của bài tập. Không có một thuật toán đúng duy
nhất; chúng tôi tìm kiếm một cách tiếp cận có thể bảo vệ được và lý lẽ rõ ràng."*

## B.2 Đã xây dựng những gì

Toàn bộ yêu cầu trên, cộng **cả năm** stretch goal tùy chọn của đề bài (§8) —
[hợp đồng API đầy đủ](docs/06_api_contracts.md):

| Endpoint | Mục đích |
|---|---|
| `POST /schedules`, `GET /schedules/:id` | Tạo/đọc vật chứa (2.1) |
| `POST/PATCH/DELETE .../staff` | CRUD nhân viên (2.2) |
| `POST .../demand/import` | Bộ import CSV — một parser quoted-field thật, không bao giờ trả lỗi trắng (2.3) |
| `POST/PATCH/DELETE .../shifts` | CRUD ca làm (2.4) |
| `POST .../auto-schedule` | Thuật toán chính — thay thế toàn bộ, idempotent theo cấu trúc (2.5) |
| `GET .../summary` | Màn hình tổng hợp, cả hai chỉ số giao dịch/giờ-nhân-viên, được **giải thích** chứ không chỉ hiển thị (2.6) |
| `POST/DELETE .../roster/assignments` | **Stretch goal 1** — sửa lịch thủ công, được kiểm soát bởi đúng `FeasibilityGate` mà auto-scheduler dùng |
| `GET .../coverage` | **Stretch goal 2** — số cần so với số đã xếp theo từng giờ, tính lại **trực tiếp** mỗi lần gọi để không bao giờ lỗi thời sau một lần sửa tay |

## B.3 Yêu cầu phi chức năng — và những gì thành thật là chưa đo

| Thuộc tính | Lập trường | Trạng thái thành thật |
|---|---|---|
| **Đúng đắn với ràng buộc cứng** | Điều duy nhất không thể thương lượng — không nhân viên nào vượt trần giờ hay bị đặt trùng ca trong ngày. Được enforce theo cấu trúc, không phải kiểm tra lại sau. | **Đã chứng minh** bằng property-based testing trên các input nhân viên/nhu cầu/ca làm được sinh ngẫu nhiên, không phải các ví dụ chọn tay (§E) |
| **Không nhận là tối ưu** | Đề bài nói rõ không có một thuật toán đúng duy nhất. Repo này cũng không tự nhận có. | Có chủ đích — chất lượng được **đo**, không bao giờ khẳng định là "tối ưu" |
| **Tính xác định (determinism)** | Cùng input hai lần → lịch giống hệt nhau về cấu trúc. | Đảm bảo bằng cấu trúc — mọi tie-break đều theo `(name, id)`, không bao giờ theo thứ tự chèn hay ngẫu nhiên — đây cũng là điều làm layer test golden-file khả thi |
| **Không bao giờ lỗi âm thầm với input xấu** | Một dòng CSV lỗi là một lỗi có vị trí cụ thể, không phải một exception ném ra hay lỗi 500. | Đã xây và test với một bộ dữ liệu CSV lỗi đa dạng, chạy trực tiếp qua HTTP thật (nhật ký Phase D của `.ai/PROJECT_STATUS.md`) |
| **Độ trễ** | Auto-schedule có độ phức tạp `O(ngày × ca × nhân viên)` mỗi pass cộng một vòng tìm kiếm rebalance có giới hạn (tối đa 200 vòng lặp) — dưới mili-giây ở quy mô này. | Không chạy load test — quy mô này (vài chục nhân viên) chưa cần; giới hạn độ phức tạp được nêu rõ thay vì bịa một con số |
| **Khả năng mở rộng của thuật toán** | Một solver LP/CP-SAT sẽ mở rộng tốt hơn nhưng bị loại cho quy mô này (§D.4). | Chủ đích hoãn lại, có nêu rõ điều kiện kích hoạt |
| **Tính sẵn sàng / xác thực / đa người dùng** | Không có. Một người dùng, một tiến trình, không tài khoản. | Ngoài phạm vi, do chính đề bài nêu rõ |

## B.4 Những gì cố tình không làm

Nêu rõ để "chưa làm" không bị hiểu nhầm là "quên":

- Không xác thực, phân quyền, hay đa tenant — đề bài nêu rõ cả ba đều ngoài phạm vi.
- Không tối ưu cấp độ solver — chính đề bài nói không có định nghĩa nào cho điều đó; một heuristic
  tham lam (greedy) cộng rebalance có giới hạn là lựa chọn bảo vệ được, không phải đường tắt (§D.4).
- Không có luật nghỉ ngơi bắt buộc (vd khoảng cách tối thiểu giữa hai ngày liên tiếp) — một ràng
  buộc trải trên **hai ngày**, khác với bốn ràng buộc hiện có; §G.3 giữ nó làm bài tập tiếp theo.
- Không xếp lịch nhiều tuần hay theo ngày tháng thật — theo chính cách đề bài đặt vấn đề, một
  schedule là *một tuần điển hình*, nên chưa thể phân tích xu hướng nhu cầu theo thời gian.

*(Đã bị thay thế, giữ lại thay vì xóa: các bản trước của tài liệu này liệt kê availability theo
nhân viên, vai trò/kỹ năng, xuất CSV và "sáu trên bảy màn hình UI" là chưa xây. Cả bốn đều đã
hoàn thành — §B.2 và §G.1 mô tả những gì thực sự tồn tại. Các mục này được đính chính tại chỗ chứ
không âm thầm gỡ đi, vì một case study tự viết lại phạm vi của chính nó thì kém giá trị hơn một
case study cho thấy phạm vi đó đã dịch chuyển.)*

## B.5 Điểm mơ hồ — nơi đề bài không nói rõ

Đề bài chủ động mời gọi điều này: *"đưa ra một quyết định hợp lý, ghi lại giả định ngắn gọn, rồi
tiếp tục."* Mười bảy giả định đã được ghi lại
([bảng đầy đủ](docs/01_business_requirements.md)). Những giả định làm thay đổi thiết kế:

| Điểm mơ hồ | Giả định | Hệ quả |
|---|---|---|
| `N` (giao dịch/giờ-nhân-viên) là bao nhiêu? Đề bài: *"bạn chọn N và giải thích lý do."* | Một tham số có thể chỉnh sửa, kèm hành động **"gợi ý từ dữ liệu"** giải cho `N` gần nhất với 80% mức sử dụng năng lực — mặc định gieo sẵn là 18, giá trị mà chính phép hiệu chuẩn của bộ dữ liệu thật trả về *khi dùng giờ floor, không phải giờ cần thô*. | Một hằng số là tùy tiện ngay khi bộ dữ liệu đổi; phương pháp hiệu chuẩn mới là câu trả lời bảo vệ được, không phải một con số ma thuật. |
| Lịch sửa tay có được phép vi phạm ràng buộc cứng không? Stretch goal 1 mời gọi chỉnh sửa thủ công. | Không. `validateRoster` replay lại **đúng** `FeasibilityGate` mà bộ tạo lịch dùng. | Hai điểm vào, một cách hiện thực duy nhất cho luật lệ — lý do đường sửa tay không thể âm thầm trở thành lỗ hổng của đảm bảo. |
| Trần giờ/tuần của nhân viên là giới hạn cứng hay chỉ là mục tiêu? | **Giới hạn cứng.** Đây là con số duy nhất đề bài nói phải được tôn trọng. | *"Bản nháp **phải** tôn trọng trần giờ tối đa mỗi nhân viên"* — "phải", đối lập với "nên cố gắng" cho tính công bằng trong cùng một câu. Đề bài phân biệt hai điều đó; cách hiện thực cũng phân biệt về mặt cấu trúc, không chỉ trong lời văn. |
| Các cột ngày trong CSV có theo vị trí không? File thật chạy Thứ Sáu…Thứ Năm trong khi schedule là Thứ Hai–Chủ Nhật. | Cột được khớp bằng cách **trích token tên ngày trong tuần từ nhãn cột**, không bao giờ theo vị trí — và file thật hóa ra cần đúng điều này: một dòng tiêu đề, một BOM UTF-8, một ô header đầu trống, và một dấu phẩy **nằm trong dấu ngoặc kép** ở mọi nhãn ngày (`"Fri, 07 Aug"`), không cái nào xuất hiện trong bảng minh họa của chính đề bài. | Đọc theo vị trí sẽ âm thầm xoay cả tuần — dữ liệu thứ Sáu rơi vào thứ Hai, và mọi con số phía sau vẫn trông hợp lý. Đây là lỗi nguy hiểm nhất có thể xảy ra trong toàn bộ đường import, chính vì không có gì trong kết quả trông sai cả. |
| Lưu trữ dữ liệu: cái gì, ở đâu? | **Điều này đã đổi giữa chừng.** Đề bài cho phép bất kỳ hình thức lưu trữ nào; repo lúc đầu chọn SQLite (không cần server), sau đó đảo ngược sang PostgreSQL + Docker + một backend NestJS thật — không phải vì đề bài yêu cầu, mà vì chính chuẩn mực của tuyển tập này yêu cầu (xem `readme.md`). Giả định 15 của `docs/01` giờ ghi PostgreSQL + Docker và giữ lại lập luận SQLite đã bị bác bỏ như thứ nó đã vượt qua, khớp với `docs/04_data_model.md`/`docs/03_architecture.md`. |

---

# C · Vì sao nó khó

## C.1 Không có tối ưu, và đề bài nói rõ điều đó có chủ đích

Khác với bài toán đặt lịch của scenario 01 — một bất biến nhị phân, chứng minh được — bài toán này
có **các mục tiêu mềm cạnh tranh nhau**: phủ giờ đông khách, nhưng cũng cho mọi người một lượng công
việc hữu ích, từ một quỹ giờ hợp đồng gần như không bao giờ vừa khít. Không có một con số duy nhất để
tối đa hóa. Đề bài nói rõ điều này thay vì giấu đi: *"không có một thuật toán đúng duy nhất; chúng
tôi tìm kiếm một cách tiếp cận có thể bảo vệ được và lý lẽ rõ ràng."* Điều đó thay đổi ý nghĩa của
"xong" — không phải "vượt qua mọi test" mà là "lý lẽ đứng vững trước sự soi xét."

## C.2 Một ràng buộc cứng mà không hàng nào trong database nhìn thấy được

Ba ràng buộc cứng phải luôn đúng trong mọi lịch: (H1) không ai vượt trần giờ/tuần, (H2) không ai làm
hai ca chồng giờ trong cùng một ngày, (H3) không ai bị xếp trùng đúng một ca hai lần. Bài toán tương
đương ở scenario 01 có một lời giải tự nhiên từ database — `EXCLUDE USING gist` của Postgres khiến
hai hàng chồng giờ nhau **không thể tồn tại**. **Mẹo đó không áp dụng được ở đây.** H1 là một **tổng
hợp trên toàn bộ các hàng của một nhân viên xuyên suốt cả tuần** — không có ràng buộc cấp-hàng nào,
trên bất kỳ database nào, có thể nhìn thấy "tổng các ca khác của người này" tại thời điểm insert. Trong
ba ràng buộc, chỉ H2 mới về lý thuyết có thể biểu diễn như một ràng buộc database, và chỉ trên
Postgres.

> **Bài học tổng quát, phát biểu lại cho hình dạng cụ thể của scenario này:** khi bất biến là một
> phép tổng hợp trên nhiều hàng thay vì một quan hệ giữa hai hàng, đảm bảo đó phải sống trong thuật
> toán, không phải trong schema — vì schema không có gì để đối chiếu cho tới khi việc ghi đã xảy ra
> rồi.

## C.3 Hệ quả kinh doanh khi làm sai

Không phải một câu hỏi chất lượng trừu tượng. Một lịch âm thầm thừa người lúc 10 giờ tối và thiếu
người lúc 1 giờ chiều thứ Sáu — giờ đông khách nhất thật sự trong bộ dữ liệu dùng ở đây — tốn tiền
lương một ca mà không thu được lợi ích phủ sóng gì, ở phía này, và mất một khách hàng bực mình vì xếp
hàng, ở phía kia. Và nó **im lặng**: cả giờ thừa người lẫn giờ thiếu người đều "hoạt động" theo nghĩa
app không crash; chỉ có số liệu coverage mới lộ ra cái nào là cái nào — đó chính là lý do coverage
view tồn tại như một stretch goal, không phải một ý nghĩ thêm sau.

## C.4 Độ khó · ★★★☆☆

Ý tưởng cốt lõi — enforce các ràng buộc cứng qua một điểm nghẽn duy nhất, và không đuổi theo một tối
ưu chưa từng được định nghĩa — là một quyết định thiết kế đơn lẻ, và một khi đã thấy thì khá đơn
giản. Điều khiến mức độ khó ở giữa thang điểm là bề rộng của khối lượng công việc phụ trợ đúng-nhưng-
dễ-bỏ-qua xung quanh nó: hiệu chuẩn số người cần có tính đến lượng tử hóa theo ca, một parser CSV thật
(không phải `split(',')`), tính công bằng được định nghĩa đủ chính xác để hiện thực, và chứng minh
tất cả trên các input được sinh ngẫu nhiên thay vì một vài ví dụ.

---

# D · Thiết kế

## D.1 Kiến trúc

```
apps/web (Next.js)                apps/scheduler-api (NestJS + Fastify)
   │  fetch, qua api-client.ts        │
   ▼                                  ▼
   ──────────────── HTTP ──────────── CQRS bus (CommandBus / QueryBus)
                                       │
                                       ▼
                              module scheduling (domain/application/infrastructure)
                                       │  gọi vào, không bao giờ hiện thực lại
                                       ▼
                    packages/scheduling-core  ⭐ thuật toán, không phụ thuộc runtime
                                       │
                                       ▼
                              PostgreSQL (Docker)
```

Sơ đồ đầy đủ và vai trò từng thành phần: [`docs/03_architecture.md`](docs/03_architecture.md). Hai
tiến trình, một Postgres, không message broker — phiên bản của riêng scenario này cho câu "không
Redis, không Kafka, cả hai đều chưa xứng đáng có mặt" của scenario 01.

## D.2 Mô hình dữ liệu

Sáu bảng. Vì sao mỗi bảng tồn tại:

| Bảng | Vì sao cần |
|---|---|
| `Schedule` | Vật chứa (2.1) — cũng mang các tham số thuật toán có thể chỉnh (`N`, `U_min`, …) |
| `StaffMember` | Tên + con số cứng duy nhất, `maxWeeklyHours` |
| `DemandCell` | Một hàng cho mỗi `(ngày, giờ)` — unique trên cặp đó, nên một lần import lại sẽ upsert (không bao giờ nối thêm) |
| `Shift` | `label`, `startMinute`, `endMinute` — phút-tính-từ-nửa-đêm, không phải `TIME`, vì mọi nơi dùng nó đều quy đổi sang số ngay lập tức |
| `Assignment` | Một nhân viên, một ca, một ngày, gắn nhãn `AUTO`/`MANUAL` — unique trên `(staffId, shiftId, dayOfWeek)`, phản chiếu đúng H3 của gate |
| `ScheduleRun` | Nguồn gốc: tham số nào đã tạo ra một lần chạy auto-schedule, và nó không phủ được gì |

Schema đầy đủ: [`docs/04_data_model.md`](docs/04_data_model.md).

## D.3 Quyết định chủ lực — một gate duy nhất, chứng minh bằng property, không bằng ví dụ

`FeasibilityGate` trong `packages/scheduling-core` là con đường duy nhất một assignment có thể vào
được roster —
[ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md). Mọi đường ghi, dù là auto-scheduler
hay một lần sửa tay, đều đi qua nó:

```typescript
const gate = new FeasibilityGate(input)
const state = new RosterState()
const verdict = gate.eligible(staffId, day, shift, state)
if (verdict.ok) state.commit(verdict.eligibility)   // CÁCH DUY NHẤT state có thể thay đổi
```

`RosterState.commit()` chỉ nhận một giá trị `Eligibility`, và gate là thứ duy nhất có thể tạo ra
nó — không có đường code thứ hai nào có thể đẩy một assignment không khả thi vào roster, theo cấu
trúc, không phải theo quy ước.

Vì §C.2 đã chỉ ra điều này không thể chứng minh bằng một ràng buộc database, nó được chứng minh theo
cách khác: **property-based testing** trên các bộ nhân viên, lưới nhu cầu và định nghĩa ca được sinh
ngẫu nhiên (`fast-check`), khẳng định với mọi input được sinh ra rằng (1) H1–H3 luôn đúng và (2)
`generateRoster` không bao giờ throw — một tuần không khả thi là một trường hợp diagnostics, không
phải một exception. Đây là phiên bản tương đương trực tiếp của test tích hợp "hai request đồng thời
thật" ở scenario 01: test duy nhất chứng minh đúng đảm bảo thật sự, về mặt cấu trúc không thể pass
một cách tình cờ.

**Hai nơi gọi, một gate, replay lại cho sửa tay.** `generateRoster` gọi gate để dựng roster từ đầu;
`validateRoster` — cùng một gate, cùng luật — replay lại nó trên một roster đã tồn tại cộng một
assignment ứng viên cho việc sửa tay (stretch goal 1). Một cách hiện thực luật lệ duy nhất, không
bao giờ có hai bản sao lệch nhau.

## D.4 Các phương án khác, và vì sao bị loại

Từ [ADR-0002 §4](docs/adr/0002-auto-schedule-algorithm.md) — một ADR không có mục "phương án bị
loại" thì không phải là một ADR:

| Phương án | Vì sao bị loại |
|---|---|
| **LP/CP-SAT (vd OR-Tools)** | Sẽ tìm ra một phân bổ chứng minh được là tối ưu so với một hàm mục tiêu — nhưng đề bài không định nghĩa hàm mục tiêu nào (công bằng và độ phủ đánh đổi nhau mà không có trọng số nêu rõ), và nó thêm một dependency solver cho một quy mô bài toán (≤ vài chục nhân viên, 14 khe ca) mà đảm bảo của solver không đáng chi phí bỏ ra. **Điều kiện xem xét lại:** các ràng buộc cứng nhân lên — kỹ năng, availability, luật nghỉ ngơi bắt buộc, nhiều địa điểm. |
| **Simulated annealing** | Vốn không xác định (non-deterministic), hoặc cần một seed được truyền xuyên suốt package — điều mà package này được xây để tránh; khó giải thích *vì sao* một chỗ nhất định lại về tay một người nhất định, điều quan trọng với yêu cầu "lý lẽ rõ ràng" của đề bài. |
| **Round-robin thuần túy** | Bỏ qua hoàn toàn mức sử dụng giờ — yêu cầu công bằng của đề bài đòi hỏi đo lường so với trần giờ của từng người, điều mà round-robin về cấu trúc không thể làm được (một người 16 giờ/tuần và một người 40 giờ/tuần được xoay vòng với trọng số ngang nhau). |
| **Tìm kiếm vét cạn (exhaustive search)** | Bất khả thi về tổ hợp ngay ở quy mô đội gieo sẵn (12 nhân viên × 7 ngày × 2 ca), chưa nói tới lớn hơn. |

Thiết kế được chọn: **ba pass gán tham lam (greedy) xác định, sau đó một pha rebalance tìm kiếm cục
bộ có giới hạn** — lấp đầy mức sàn (floor) tối thiểu, ưu tiên nhân viên chưa dùng nhiều giờ; bù thêm
hướng tới mức đỉnh (target); rồi hoán đổi assignment giữa nhân viên nhiều giờ nhất và ít giờ nhất
trong khi gate vẫn chấp thuận và khoảng cách mức sử dụng giờ tiếp tục thu hẹp thật sự (giới hạn cứng
200 vòng lặp). Cơ chế đầy đủ: [ADR-0002](docs/adr/0002-auto-schedule-algorithm.md).

## D.5 Các quyết định khác đáng học theo

- **Một parser CSV quoted-field viết tay thật, không phải `line.split(',')`.** Nhãn ngày trong file
  nhu cầu thật chứa dấu phẩy **nằm trong dấu ngoặc kép** (`"Fri, 07 Aug"`) — chính bảng minh họa của
  đề bài là điều dễ dẫn tới việc viết phiên bản ngây thơ đó. Cột được khớp theo **token** tên ngày
  trong tuần, không bao giờ theo vị trí, nên một file bị đảo thứ tự cột được xử lý miễn phí.
- **`N` được hiệu chuẩn theo giờ-nhân-viên floor, không phải giờ cần thô.** Khoảng hở do lượng tử hóa
  theo ca (không thể thuê ai chỉ cho đúng 1 giờ chiều) là khoảng 20% ở mọi giá trị `N`; bỏ qua nó sẽ
  cấp thiếu đúng bằng con số đó.
- **Coverage view luôn tính lại trực tiếp, không bao giờ từ một snapshot đã lưu** — một khi có sửa
  tay, câu trả lời cache từ "lần chạy auto-schedule gần nhất" sẽ lỗi thời ngay khi quản lý thêm hoặc
  xóa một assignment. Đã kiểm chứng trực tiếp: xóa một assignment làm thay đổi số liệu coverage của
  giờ đó ngay ở lần đọc tiếp theo, không cần chạy lại.
- **`scheduling-core` không phụ thuộc runtime nào, được enforce bằng lint**
  ([ADR-0004](docs/adr/0004-scheduling-core-as-a-pure-package.md)) — dữ liệu thuần vào, dữ liệu
  thuần ra, không framework, không ORM, không thư viện validation. Đây là điều làm cho việc chạy
  hàng nghìn test case property mỗi lần commit trở nên khả thi về chi phí, và cũng là điều giúp
  package này sống sót nguyên vẹn qua một lần viết lại toàn bộ kiến trúc backend (mục dưới đây).

## D.6 Công nghệ, và vì sao — kể cả một quyết định đã đảo ngược giữa chừng

| Lựa chọn | Lý do |
|---|---|
| **`packages/scheduling-core`, không dependency** | Thuật toán phải chứng minh được bằng property test với tốc độ cao; một dependency framework hay ORM sẽ làm chậm bộ test và làm mờ đi thứ đang thực sự được kiểm chứng. |
| **NestJS + Fastify + PostgreSQL + Docker + CQRS** | *Không phải lựa chọn đầu tiên.* Một bản nháp trước đó đã lập luận rút gọn xuống còn một app Next.js + SQLite — không tiêu chí chấm điểm nào trong năm tiêu chí của đề bài là hạ tầng, vậy tại sao phải dựng một container mà đề bài không yêu cầu? Lập luận đó đúng cục bộ, và vẫn bị đảo ngược: chuẩn mực của chính tuyển tập này là mỗi scenario phải có một **thiết kế backend thật**, giống cách scenario 01 làm. `.ai/plans/backend-architecture-reversal.plan.md` ghi lại việc đảo ngược này, kể cả lập luận đã bị bác bỏ, thay vì xóa đi bằng chứng rằng phương án đơn giản hơn đã được cân nhắc nghiêm túc. |
| **CQRS + Unit of Work** (`packages/shared-kernel`, port từ scenario 01) | Biến ranh giới transaction thành một điều có cấu trúc, không phải một kỷ luật phải nhớ — [ADR-0005](docs/adr/0005-transaction-retry-boundary.md), ADR duy nhất trong scenario này được port thay vì viết mới hoàn toàn. |
| **Zod, chỉ ở biên controller** | Một thư viện validation duy nhất, áp dụng một lần — `scheduling-core` tin tưởng hoàn toàn vào nơi gọi nó theo thiết kế; ranh giới giữ sự tin tưởng đó là việc của `apps/scheduler-api`, không bao giờ là việc của thuật toán. |

---

# E · Tính đúng đắn

## E.1 Cần chứng minh điều gì

Một câu: **với bất kỳ danh sách nhân viên, lưới nhu cầu và bộ ca làm nào, lịch được tạo ra không bao
giờ để một ràng buộc cứng bị vi phạm, và bộ tạo lịch không bao giờ crash khi cố gắng.** Mọi thứ
khác — chất lượng độ phủ, tính công bằng — được **đo**, không được chứng minh, vì không có tối ưu
nào được định nghĩa (§C.1).

## E.2 Ba lớp test, mỗi lớp chứng minh điều các lớp khác về cấu trúc không thể

103 test chỉ riêng trong `packages/scheduling-core` — 289 test toàn workspace — trải trên các lớp đi vào ở độ sâu khác nhau —
có chủ đích, cùng kỷ luật scenario 01 dùng:

| Lớp | Đi vào ở | Chứng minh | Về cấu trúc **không thể** chứng minh |
|---|---|---|---|
| **1 ⭐ Property-based** (`fast-check`) | Trực tiếp `generateRoster`/`validateRoster`, trên input được sinh ngẫu nhiên | Với **bất kỳ** nhân viên/nhu cầu/ca nào được sinh ra: H1–H3 luôn đúng, hàm là total (không bao giờ throw), cùng input hai lần → lịch giống hệt về cấu trúc | App được nối dây đúng; lịch *tốt*, không chỉ hợp lệ |
| **2 Golden file** | Snapshot Vitest trên file CSV thật đã commit | Đúng chính xác lịch/summary/diagnostics cho một bộ dữ liệu thật, gồm cả phép tính minh họa của chính đề bài | Bất kỳ điều gì về input khác |
| **3 Tích hợp** | HTTP thật, Postgres thật | Bộ import CSV trên toàn bộ corpus dữ liệu lỗi thật; `validateRoster` từ chối một lần sửa tay bất hợp lệ; coverage view tính lại trực tiếp | Tính tổng quát — lớp này chỉ từng thấy một bộ dữ liệu gieo sẵn |

Lớp 1 là lớp chủ lực, vì cùng một lý do test "hai request đồng thời thật" của scenario 01 là chủ
lực: đây là lớp duy nhất không thể được thỏa mãn bởi code chỉ *trông* đúng.

## E.3 Mỗi lớp thực sự đã bắt được gì — lỗi thật, không phải giả định

Phần kém hào nhoáng nhất, và cũng hữu ích nhất, của tài liệu này:

- Việc suy lại phép tính hiệu chuẩn `N` của chính plan trên bộ dữ liệu thật trong Phase 1 phát hiện
  ra chính phép tính của plan bị sai: plan khẳng định **N=18** là đáp án hiệu chuẩn; phép tính thật
  trả về **N=15**. `18` vẫn được gieo làm mặc định (một lựa chọn có chủ đích, được công khai —
  `suggestTransactionsPerStaff` báo cáo trung thực con số 15 thay vì công thức bị âm thầm chỉnh lại
  cho khớp với giá trị mặc định đã chọn) — nhưng sự chênh lệch này sẽ không bao giờ bị phát hiện nếu
  không đo trên file thật thay vì tin vào lời văn của plan.
- `npm test` của chính `apps/scheduler-api` có 3/5 bộ test **âm thầm không load được** kể từ khi
  backend được xây lần đầu — do thiếu một rule strip đuôi `.js` trong cấu hình Jest. Không ai để ý
  vì việc kiểm chứng trước đó chỉ chạy server đã build + `curl`, chưa bao giờ chạy chính bộ test của
  app này.
- Hai app (`apps/web` dùng SQLite, `apps/scheduler-api` dùng Postgres) dùng **chung một thư mục
  Prisma client được generate** — app nào chạy `prisma generate` sau cùng sẽ âm thầm ghi đè client
  của app kia, khiến app kia crash lúc khởi động với một lỗi trông không liên quan gì. Phát hiện
  giữa phiên làm việc, đã sửa, và đóng vĩnh viễn bằng cách xóa hẳn schema của `apps/web` khi không
  còn cần nữa.
- Một script tooling (`scripts/sync.cjs`, tự động hóa Stop-hook của chính repo) vẫn giữ một đường
  dẫn cứng tới `apps/web/prisma/` sau khi thư mục đó đã bị xóa — vô hình với typecheck/lint/test vì
  đây là một script Node thuần, không có bước compile — chỉ bị phát hiện vì một lượt kiểm tra tài
  liệu sau đó thực sự **chạy** script thay vì giả định nó vẫn hoạt động.

## E.4 Những gì test không thể chứng minh

- Rằng các test đã hỏi đúng câu hỏi — mọi lỗi ở trên đều nằm trong code đã vượt qua bộ test của
  chính lớp đó; mỗi lỗi được phát hiện bằng cách thực sự chạy một thứ gì đó (server thật, script
  thật, HTTP thật), không phải bằng cách viết thêm assertion trong cô lập.
- Chất lượng lịch làm việc ngoài những gì được đo rõ ràng (tỷ lệ độ phủ, độ lệch mức sử dụng giờ) —
  không có "lịch tối ưu" nào để đối chiếu, vì không có định nghĩa nào cho nó.
- Hành vi dưới tải với nhiều schedule đồng thời — ngoài phạm vi; đây là công cụ một-người-dùng theo
  đúng phạm vi đề bài nêu, và không có con số nào được bịa ra để ngụ ý khác.

---

# F · Giá trị học tập

## F.1 Khái niệm, và xem ở đâu

| Khái niệm | Ở đâu |
|---|---|
| Enforce một bất biến theo cấu trúc, khi không ràng buộc database nào biểu diễn được | [ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md), `assignment/feasibility-gate.ts` |
| Property-based testing như cơ chế chứng minh cho một thuật toán, không phải một database | `index.prop-spec.ts`, `directives/testing_standard.md` |
| Từ chối một solver có chủ đích, kèm điều kiện sẽ đổi câu trả lời | [ADR-0002](docs/adr/0002-auto-schedule-algorithm.md) |
| Một package không dependency runtime như một ranh giới kiến trúc, enforce bằng lint | [ADR-0004](docs/adr/0004-scheduling-core-as-a-pure-package.md), `eslint.config.js` |
| Một parser CSV quoted-field thật và vì sao `.split(',')` là một cái bẫy | `demand-csv.parser.ts` |
| Tính lại trực tiếp một read so với tin vào snapshot cache, và khi nào dùng cái nào | Docstring của `GetCoverageHandler`, ghi chú đã sửa trong `docs/04_data_model.md` |
| Tách CQRS command/query, Unit of Work | `packages/shared-kernel/src/cqrs/`, [ADR-0005](docs/adr/0005-transaction-retry-boundary.md) |
| Một quyết định kiến trúc bị đảo ngược giữa chừng, giữ lại lập luận cũ thay vì xóa đi | `.ai/plans/backend-architecture-reversal.plan.md` §0 |

## F.2 Kiến thức cần có trước

**Cần:** tư duy thuật toán cơ bản (gán tham lam, "ràng buộc" nghĩa là gì về mặt tính toán);
TypeScript; REST. **Có ích, không bắt buộc:** property-based testing, NestJS, CQRS, Docker — mỗi
cái được giải thích ngay chỗ nó xuất hiện. **Không cần:** công cụ operations-research, hệ thống
phân tán — có chủ đích, cả hai đều không xuất hiện ở đây.

## F.3 Thời gian

| Mục tiêu | Ước tính |
|---|---|
| Hiểu ý tưởng cốt lõi | ~15 phút (tài liệu này, §C và §D.3) |
| Đọc kỹ thiết kế | ~1 giờ (`docs/03` + ADR-0001 + ADR-0002) |
| Chạy thử và thấy đảm bảo giữ vững | ~15 phút (`RUN.md` → bộ test property của `packages/scheduling-core`) |
| Tự xây lại từ đầu | 1–2 ngày cho phần lõi thuật toán; backend service xây quanh nó (thứ scenario này cũng đã xây, thêm vào phần tối thiểu của đề bài) gần một tuần hơn |

## F.4 Những cái bẫy — nơi người ta thực sự hay sai

1. **Theo thói quen từ scenario 01, tìm một ràng buộc database.** Không áp dụng được ở đây — trần
   giờ/tuần là một phép tổng hợp trên nhiều hàng, vô hình với mọi ràng buộc cấp-hàng (§C.2).
2. **Đuổi theo một tối ưu đề bài chưa từng định nghĩa.** Đề bài nói rõ điều này; vẫn xây một solver
   là trả lời một câu hỏi không ai hỏi.
3. **`line.split(',')` trên CSV nhu cầu.** Chính bảng minh họa của đề bài dẫn thẳng tới đây — nhãn
   ngày trong file thật chứa dấu phẩy nằm trong dấu ngoặc kép.
4. **Hiệu chuẩn `N` theo giờ cần thô, không phải giờ floor.** Khoảng hở do lượng tử hóa theo ca vô
   hình cho tới khi đo trên bộ dữ liệu thật, không phải giả định phép tính của đề bài là chính xác.
5. **Viết một bản hiện thực thứ hai cho luật ràng buộc khi sửa tay.** Hai bản sao chính là cách
   đường auto-schedule và đường sửa tay lệch nhau — hãy replay lại đúng gate thay vì viết lại.
6. **Đọc cột CSV theo vị trí.** Âm thầm xoay cả tuần; mọi con số phía sau vẫn trông hợp lý, đó chính
   là điều khiến nó nguy hiểm hơn là chỉ đơn thuần sai.
7. **Tin vào một snapshot "lần chạy gần nhất" đã cache cho một view phải phản ánh một lần sửa tay.**
   Cả coverage lẫn summary đều phải tính lại trực tiếp một khi có sửa tay, nếu không chúng sẽ nói dối
   ngay khi có một lần sửa xảy ra.

## F.5 Liên quan tới phỏng vấn

Dùng lại trực tiếp khi được hỏi thiết kế: **xếp lịch ca làm**, **xếp lịch điều dưỡng**, **quản lý
nhân lực tổng đài**, hoặc bất kỳ câu hỏi *"chuyển một dự báo nhu cầu thành một kế hoạch nhân sự"*
nào.

Câu trả lời đúng hướng không phải "chạy một solver". Mà là: *"Ở đây không có tối ưu nào được định
nghĩa, nên việc cần làm là enforce các ràng buộc cứng theo cấu trúc — một gate duy nhất mà mọi
assignment phải đi qua — và chứng minh điều đó bằng property-based test trên input được sinh ngẫu
nhiên, vì không có mẹo database nào nhìn thấy một ràng buộc tổng-hợp-trên-nhiều-hàng theo cách nó
nhìn thấy một sự chồng chéo giữa hai hàng. Các mục tiêu mềm thì được đo, không khẳng định là tối
ưu."* Sau đó nêu tên các phương án bị loại và vì sao
([§D.4](#d4-c%C3%A1c-ph%C6%B0%C6%A1ng-%C3%A1n-kh%C3%A1c-v%C3%A0-v%C3%AC-sao-b%E1%BB%8B-lo%E1%BA%A1i)).

---

# G · Tiến hóa

## G.1 Ở quy mô 10× và 100×

| Quy mô | Điều gãy trước tiên | Cách sửa, đã được thiết kế sẵn |
|---|---|---|
| **10×** (hàng trăm nhân viên) | Giới hạn 200 vòng lặp của pha rebalance có thể dừng trước khi hội tụ | Nâng giới hạn, hoặc đổi cách chọn cặp của rebalance sang priority queue thay vì quét tuyến tính — hình dạng thuật toán không đổi, chỉ đổi ngân sách tìm kiếm |
| **10×** (nhiều schedule/cửa hàng) | Không có gì gãy về cấu trúc — mỗi `Schedule` đã độc lập hoàn toàn (nhân viên, ca, nhu cầu, lịch riêng) | — |
| **100×** (cần vai trò/kỹ năng) | Chỗ H4 của `FeasibilityGate` (hiện đang dùng lại cho "tham chiếu không tồn tại") cần một kiểm tra trình độ thật | Một bảng nối `StaffSkill`/`ShiftRequiredSkill`, phản chiếu `TechnicianServiceType` của scenario 01 — cùng hình dạng, khác lĩnh vực |
| **100×** (độ phức tạp nhiều ràng buộc thật: luật nghỉ bắt buộc, availability theo người, nhiều địa điểm) | Điểm mù của heuristic tham lam lớn nhanh hơn chi phí thiết lập một solver | Đây chính là điều kiện được nêu rõ trong `ADR-0002` để xem xét lại việc từ chối LP/CP-SAT |

## G.2 Hoãn lại, kèm điều kiện kích hoạt

Mỗi điều dưới đây là một quyết định, ghi lại cùng điều kiện sẽ đảo ngược nó (bảng đầy đủ:
[`docs/03_architecture.md`](docs/03_architecture.md)):

| Năng lực | Điều kiện kích hoạt |
|---|---|
| Một solver LP/CP-SAT | Các ràng buộc cứng nhân lên — kỹ năng, availability, luật nghỉ bắt buộc, nhiều địa điểm |
| Kho lưu idempotency | Xuất hiện một thao tác ghi kiểu append-only (hiện tại: auto-schedule thay thế toàn bộ, import CSV thì upsert — cả hai đều không cần) |
| Hạ tầng scrape Prometheus/Grafana | Một yêu cầu rõ ràng, hoặc một nhu cầu debug mà log không trả lời được (`/metrics` đã expose sẵn registry) |
| Luật nghỉ ngơi bắt buộc | Một ràng buộc trải trên hai ngày, khác với bốn ràng buộc hiện có — xem §G.3 |

## G.3 Tự mở rộng scenario

Các bài tập hay, xếp gần đúng theo độ khó tăng dần:

1. **Luật nghỉ ngơi bắt buộc** — vd cần cách nhau 11 giờ giữa hai ca ở hai ngày liên tiếp. Lưu ý đây
   là một ràng buộc trải trên **hai ngày**, khác với bốn ràng buộc hiện có, nên nó không thể là một
   hàm thuần của `(nhân viên, ngày, ca)` như `H4`.
2. **Xếp lịch nhiều tuần** — hiện một schedule là một tuần điển hình; ngày tháng thật sẽ đổi thứ mà
   bảng tổng hợp gộp theo.
3. **Xếp lịch nhiều địa điểm** — nhân viên dùng chung giữa nhiều hơn một `Schedule`. Đây là điểm mà
   việc từ chối LP/CP-SAT của `ADR-0002` đáng được xem xét lại thật sự.

---

## Đi tiếp tới đâu

| | |
|---|---|
| **Chạy thử** | [`RUN.md`](RUN.md) |
| **Tài liệu thiết kế hệ thống** | [`docs/03_architecture.md`](docs/03_architecture.md) |
| **Quyết định chủ lực, đầy đủ** | [`docs/adr/0001-constraint-enforcement-strategy.md`](docs/adr/0001-constraint-enforcement-strategy.md) |
| **Quá trình xây dựng có AI hỗ trợ được điều hướng và kiểm chứng thế nào** | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) |
| **Quay về tuyển tập** | một repo anh em trong cùng bộ sưu tập cá nhân |
