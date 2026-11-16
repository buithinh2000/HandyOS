# HandyOS

**HandyOS** — quản lý công trình, nhân công, check-in/out, lương, vật tư mua hộ và lợi nhuận. Ưu tiên trải nghiệm điện thoại và một quy trình phát hành đơn giản.

- [Cách đóng gói và triển khai đơn giản](docs/SIMPLE-DEPLOYMENT.md)
- [Kiến trúc và ranh giới bảo vệ dữ liệu](ARCHITECTURE.md)
- [Điều kiện kích hoạt cloud](cloud/CANONICAL-STAGING-PLAN.md)

**Trạng thái:** demo hiện tại dùng bộ nhớ trình duyệt; API/đăng nhập/Bills cloud đã có mã nguồn và kiểm thử giả lập, chưa kích hoạt AWS thật. Không nhập dữ liệu khách hàng, lương hay hóa đơn thật vào demo khi chưa triển khai và xác minh lưu trữ cloud.

Phiên bản API được đóng gói trong một Docker image bằng `docker build`; AWS PostgreSQL, Cognito và S3 vẫn phải là tài nguyên HandyOS riêng biệt, không chia sẻ với BuiTai Core.
