# 2. Thiết kế Rig giải phẫu đầy đủ chân và tay cho Phật tử (Devotee Avatar) bằng Three.js InstancedMesh

## Context
Nhân vật Phật tử trong Chánh Điện 3D ban đầu được mô phỏng với dáng vạt áo tràng dài dạng váy quây (`skirt`) bao bọc toàn bộ thân dưới, chỉ để lộ một đoạn cẳng chân ngắn phía dưới gấu áo và bàn tay tròn không ngón. Thiết kế này khiến dáng đi chưa bộc lộ hết sải bước, động tác quỳ lạy và chắp tay búp sen chưa đạt độ biểu cảm sinh động, đồng thời chưa phản ánh đúng y phục Phật tử áo lam đi chùa (áo ngắn ngang hông và quần dài 2 ống) như thực tế.

## Decision
Chúng tôi quyết định nâng cấp toàn diện cấu trúc hình học (Procedural Geometry) và hệ thống khung xương động học (Rigging & Kinematics) của Phật tử (Devotee Avatar):

1. **Công nghệ dựng hình (Procedural InstancedMesh)**:
   - Tiếp tục sử dụng `THREE.InstancedMesh` của Three.js, không sử dụng mô hình 3D SkinnedMesh (`.glb`/`.fbx`) có xương phức tạp nhằm bảo toàn tuyệt đối hiệu năng 60 FPS cho phiên phát sóng TikTok Live và OBS khi hiển thị đồng thời hàng trăm người.

2. **Cấu trúc thân dưới & Chân 2 phân đoạn (Two-Segment Legs & Pants)**:
   - Thay thế vạt áo tràng dài dạng váy (`skirt`) bằng tà áo ngắn ngang hông (`tunicHem`) để lộ trọn vẹn 2 chân.
   - Rig chân gồm 2 phân đoạn độc lập cho mỗi bên: Đùi (`thigh` / `upperLeg`) và Cẳng chân (`leg` / `calf`), kết thúc bằng Bàn chân mang hài/tất trắng (`foot`).
   - Cả áo và quần đều đồng bộ sắc lam thanh tịnh (`T.robe`) theo danh tính người xem.

3. **Cấu trúc cánh tay & Bàn tay Chibi có ngón cái (Chibi Mitten Hands & Flared Cuffs)**:
   - Cánh tay có ống tay áo loe nhẹ ở cổ tay (`cuff`), giúp bàn tay Chibi vươn ra mềm mại.
   - Bàn tay được tạo hình cách điệu có ngón cái (`thumb`) phân biệt bên trái và bên phải, đảm bảo khi chắp tay búp sen (anjali mudra) hoặc cầm 3 nén nhang thì ngón cái luôn hướng đúng phương vị tâm linh.

4. **Động học bước đi & Quỳ lạy (Kinematics)**:
   - **Bước đi (Walk Cycle)**: Đùi vung góc và cẳng chân gập tự nhiên theo nhịp sải bước, bàn chân tiếp đất vững chãi.
   - **Quỳ lạy (Kneel Pose)**: Đùi hạ thấp song song với mặt bồ đoàn, cẳng chân gập gọn ra sau, mu bàn chân trắng duỗi xuôi theo mặt đệm gấm, hai tay chắp búp sen hoặc úp sát mặt sàn Chánh Điện khi lạy.

5. **Màu sắc trang phục chân**:
   - Chân mang hài vải / tất trắng thanh nhã (`0xededed`), tạo độ tương phản rõ nét với thảm đỏ Chánh Điện.

## Consequences
- **Ưu điểm**:
  - Dáng đi và tư thế lễ bái của Phật tử trở nên sống động, rõ từng khớp gối và chuyển động tay.
  - Phù hợp hoàn toàn với hình ảnh Phật tử thực tế và văn hóa Phật giáo Việt Nam.
  - Tối ưu hiệu năng xuất sắc nhờ giữ nguyên kiến trúc InstancedMesh.
- **Đánh đổi**:
  - Cần tính toán thêm ma trận biến đổi của khớp đùi (`thigh`) và điều chỉnh logic động học quỳ lạy trong `updateAvatars`.
