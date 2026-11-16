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
