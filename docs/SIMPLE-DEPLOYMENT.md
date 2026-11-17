# HandyOS — đơn giản hoá cài đặt và cập nhật

**Mục tiêu:** người dùng chỉ truy cập một địa chỉ HandyOS trên điện thoại. Người dùng không vận hành AWS, IAM, S3 hay database. Đội phát triển thực hiện một quy trình build → kiểm thử → triển khai → xác minh rồi phát hành phiên bản mới.

**Hiện trạng:** Docker image hiện đóng gói **giao diện cloud + API** trong cùng một artifact. CI *chỉ build* image, không push lên registry, không deploy, không chỉnh sửa AWS. Giao diện ở `/` và `/auth/callback` cùng các module cố định trong `/assets/`; `/config.json` chỉ trả về các public Cognito/API origin được kiểm tra tại runtime. Không có file `.env`, DB URL hoặc khóa AWS trong gói. Cognito, PostgreSQL, S3 thực tế vẫn chưa được kích hoạt/kết nối, và `owner-v1.html` vẫn là demo lưu trên thiết bị.

## Một bản phát hành, không phải nhiều bước cho chủ doanh nghiệp

- **Frontend**: web app dành cho điện thoại, Check-in/Check-out, Jobs, Staff, Payroll, Bills và Profit. Có thể deploy tĩnh trên Cloudflare; không lưu dữ liệu nhạy cảm trên trình duyệt.
- **API**: một ứng dụng Node.js đóng gói trong một Docker image (`Dockerfile`). Giữ logic xác thực Cognito, nghiệp vụ và kiểm tra phân quyền tại một nơi.
- **Database**: một PostgreSQL *riêng biệt* cho HandyOS, không dùng chung BuiTai Core. Cơ chế FORCE RLS vẫn bắt buộc.
- **Ảnh bill**: một bucket S3 riêng của HandyOS. Ứng dụng dùng presigned URL, ảnh không chèn vào JSON ledger.
- **Đăng nhập**: một Cognito User Pool/app client HandyOS riêng; tài khoản Owner/Manager được cấp quyền rõ ràng.

Các dịch vụ phía sau không cần được người dùng quản lý. Người dùng chỉ cần một địa chỉ web. Không tự động tạo dịch vụ AWS tốn tiền trước khi được duyệt.

## Build một gói HandyOS cloud (frontend + API, source-only)

```bash
node scripts/verify-one-package.mjs
docker build -t handyos-api:local .
```

Docker image chứa `backend/src`, `shared`, `web/`, thư viện Node được cài ở build time. Không chứa demo localStorage, tài liệu nội bộ, file `.env`, credentials hoặc triển khai cloud. Image chạy bằng user không phải root. Startup mặc định từ chối nếu chưa có `DATABASE_URL`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `AWS_REGION`.

**Không chạy lệnh trên để triển khai vào AWS.** Nó chỉ build và kiểm thử gói. Không điền mật khẩu hoặc database URL vào GitHub, Dockerfile hay commit; khi được phép triển khai phải tiêm cấu hình tại runtime từ bộ secret *riêng* của HandyOS.

## Quy tắc cho phiên bản thương mại

1. Một nhánh phát hành chứa frontend và backend của cùng phiên bản.
2. CI chạy kiểm thử ứng dụng, bảo mật và build Docker image một lần.
3. Chỉ có một quy trình phát hành lên staging, rồi kiểm chứng login → Jobs → Bills → S3 → PostgreSQL với dữ liệu giả lập.
4. Khi chứng minh an toàn và đã có phê duyệt nguồn lực/chi phí, một thao tác deploy phiên bản đã kiểm thử sẽ được sử dụng; rollback bằng image cũ và backup riêng.
5. Không trộn tài nguyên BuiTai Core, không chuyển dữ liệu demo cũ tự động, không xem mock tests là hoạt động thật.

**Ưu tiên tiếp theo:** kết nối giao diện cloud với runtime, staging tự động với danh tính triển khai HandyOS độc lập, kiểm thử sao lưu và chi phí. Thực hiện một lần cho mỗi phiên bản, không yêu cầu chủ doanh nghiệp đọc từng PR.

## Phát hành giao diện cloud

Web frontend và API chung một Docker image, dù bên ngoài có thể dùng hai hostname HTTPS `staging.handyos.buitai.com` và `api-staging.handyos.buitai.com` trỏ về cùng ứng dụng sau khi được cấu hình. Một quy trình build/release thay thế việc tự upload từng file. Module `backend/src/frontend-assets.mjs` chỉ cho phép danh sách route tĩnh; các route kinh doanh `/v1/*` vẫn yêu cầu JWT và PostgreSQL RLS.

Để bật giao diện sau khi hạ tầng đã được phê duyệt và triển khai, môi trường chạy phải cung cấp `HANDYOS_UI_ORIGIN`, `HANDYOS_API_ORIGIN`, `HANDYOS_COGNITO_DOMAIN`, `HANDYOS_COGNITO_CLIENT_ID` và `FRONTEND_ORIGIN` (đúng bằng UI origin), ngoài cấu hình backend. Không hardcode token hay mật khẩu vào code, không cung cấp AWS key cho frontend. `/config.json` trả 503 nếu thiếu hoặc sai định danh HandyOS.

**Vẫn chưa có trang đăng nhập cloud hoạt động thực tế hoặc lưu bill lên AWS thật.** Đây là gói phát hành *source-only* có kiểm thử, không phải thông báo go-live.

## Một file tải về sau khi CI build trên main

Khi commit được merge vào `main`, workflow **HandyOS single-package build (NO DEPLOY)** tạo GitHub Actions artifact `handyos-one-image-source-bundle` có `handyos-image.tar.gz` (Docker image frontend + API), `SHA256SUMS.txt` (kiểm tra toàn vẹn) và `INSTALL.txt`. Đây là file gói cho kỹ thuật viên cài đặt; **không phải** một website đã kết nối AWS. Không tự triển khai, không tự tạo database, không tự phát sinh tài nguyên AWS hay di chuyển dữ liệu cũ. Chỉ tải gói xuống và triển khai khi đã có môi trường HandyOS riêng được phê duyệt.

Đường dẫn: GitHub repo → Actions → **HandyOS single-package build (NO DEPLOY)** → lần chạy thành công trên `main` → Artifacts. CI giữ artifact 7 ngày, không tạo GitHub Release công khai. Nếu muốn phát hành cho khách hàng thật, cần kiểm chứng backup, mật khẩu runtime và dữ liệu riêng trước.

## Bill lưu vào AWS thật — runtime đã nối ở mã nguồn, chưa bật trên AWS

API giờ khởi tạo workflow PostgreSQL + S3 qua `backend/src/receipt-runtime.mjs` thay vì luôn trả về 503. Mặc định `HANDYOS_RECEIPTS_ENABLED` không phải `true` thì Bills cloud vẫn chưa lưu thật (fail-closed). Để bật trong môi trường HandyOS đã được triển khai, cần các biến dành riêng HandyOS: `HANDYOS_RECEIPTS_ENABLED=true`, `HANDYOS_ISOLATED_RESOURCES_VERIFIED=true`, `HANDYOS_AWS_ACCOUNT_ID`, `AWS_REGION`, `HANDYOS_RECEIPT_BUCKET`, `HANDYOS_RECEIPT_KMS_ARN`, `DATABASE_URL` và cặp Cognito User Pool/App Client ID. Chúng **không phải** giấy phép triển khai hay bằng chứng bảo mật: phải đối chiếu hạ tầng, IAM, dữ liệu, kết nối S3 CORS và backup thực tế trước khi bật. Không dùng các biến của BuiTai Core, không ghi giá trị secret vào source.

Khi môi trường hợp lệ đã được phê duyệt, một binary ứng dụng sẽ khởi động với workflow Bills thật và dùng lại authentication / RLS. Trong lúc chưa có AWS riêng, startup để Bills disabled và API vẫn sẵn sàng cho kiểm thử giao diện. **Chưa có bill thật nào được ghi lên AWS trong thay đổi này.**

## Daily crew API for authenticated Owner/Manager

Backend routes in the same verified Cognito + tenant-scoped transaction as Jobs: `GET /v1/staff` lists employees; `POST /v1/staff` creates an employee with hourly/daily rate; `GET /v1/attendance?date=YYYY-MM-DD` lists a selected workday; `POST /v1/attendance/check-in` accepts jobId, staffId and local workDate; `POST /v1/attendance/:id/check-out` completes the open record. Employee day/hour pay is snapshotted from staff profile at check-in, never accepted from the browser. Duplicate same-day entries return 409, including simultaneous requests under SQL uniqueness, and financial/attendance actions write audit records. These routes use the existing dedicated HandyOS PostgreSQL tables in migration 003, already protected by FORCE RLS. Worker/Homeowner cannot read payroll. Source-only: not a live production deployment, no AWS writes.

## Trang Today trên HandyOS cloud

Sau đăng nhập Cognito, hệ thống mở **Today · Crew check-in** ở đầu trang, trước Bills. Owner/Manager chọn công trình và nhân viên, bấm Check in; phần Today's attendance hiển thị các entry từ API và có Check out đối với entry đang mở. Nút Add employee cho phép tạo hồ sơ nhân viên với mức lương ngày/giờ. Dữ liệu luôn lấy từ API PostgreSQL xác thực; không dựa trên demo `localStorage`. Hệ thống chỉ báo thành công sau khi server xác nhận. Kiểm thử trình duyệt iPhone và desktop sử dụng fake backend, không gọi AWS. Chưa kết nối cơ sở dữ liệu production.

## Weekly payroll (Owner/Manager only)

The mobile cloud app now exposes **Employees → employee → Weekly payroll** immediately below Today. It reads the original wage snapshot for completed check-in/out days, deducts the recorded unpaid break for hourly pay, and adds independently recorded week-specific bonuses or allowances. Bank transfers are **explicitly allocated to a Monday-start workweek**, because the payment date might be later. Older payments with no allocation are preserved as unallocated and are **not silently counted** in a week.

Totals shown are earned, extras, due, paid and remaining; negative remaining indicates overpayment. Closing a week is allowed only when no attendance remains checked in, the week has work/adjustments and total paid exactly equals total due. Closure stores an immutable snapshot and blocks API changes to that week's attendance/bonuses/payments. Mobile shows an employee overview then the selected employee's detail. A backup restore and production-grade accounting review are needed before using real payroll data. All new data is from HandyOS PostgreSQL RLS, not localStorage.

Migration `005_payroll_week_closures.sql` is **not applied in production** by this PR; the migration is only executed in isolated GitHub PostgreSQL integration tests.

## Employee profile: extras and other expenses

Employees → select employee shows the base daily/hourly wage rate. Its weekly payroll includes separate **Bonus**, **Allowance** and **Other expense / reimbursement** fields, notes, attached job and selected workweek. These are **one-off week-specific additions**, not an automatic wage-rate change and not customer material reimbursement bills. The underlying adjustments table remains tenant-scoped under FORCE RLS; after settlement the employee's week is immutable. Weekly due = wages earned from completed attendance + bonus + allowance + employee expenses. Paid is recorded separately. Source-only until private HandyOS production migrations are approved and deployed.
