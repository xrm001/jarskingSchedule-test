INSERT INTO meeting_rooms (id, name, floor, capacity, equipment) VALUES
  ('0a12f96c-3f35-4e0d-82ff-e92d69310d91', '17楼大麻展厅', 17, 8, '电视'),
  ('04a3f3ef-f62f-4725-94ca-c3b81ec8be20', '17楼会议室1', 17, 10, '电视'),
  ('17974b95-8bf1-448c-b494-e30dcc07b29e', '17楼会议室2', 17, 4, NULL),
  ('d1e306c6-75fe-48e1-b4c7-518dd9dfde15', '17楼香水小展厅', 17, 8, '电视'),
  ('505548d7-0447-4e6c-b36b-c95ea4926930', '18楼大会议室', 18, 50, '投影、视频'),
  ('8dff46a6-a318-4d4e-a239-6098eea741af', '18楼会议室', 18, 10, '投影'),
  ('b5d8c3a0-54db-4e7d-86f7-1c16da1e2cf0', '18楼会客室', 18, 6, '石总办公室，仅石总可选')
ON CONFLICT (name) DO UPDATE SET
  floor = EXCLUDED.floor,
  capacity = EXCLUDED.capacity,
  equipment = EXCLUDED.equipment,
  enabled = true,
  updated_at = now();
