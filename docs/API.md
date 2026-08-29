# API와 스트림 계약

## REST

### `GET /health`

서버 상태, 연결된 WebSocket 클라이언트 수, 서버 시간을 반환합니다.

### `GET /api/plant/summary`

공장과 라인, 네 개 공정 단계, 설비 상태, 활성 인시던트, 원인 사슬과 근거를 반환합니다.

### `GET /api/equipment/:equipmentId/history?intervalMs=100`

최근 30분의 센서 이력을 반환합니다. 간격은 50ms에서 1,000ms 사이로 제한하며, 값이 없거나 숫자가 아니면 100ms를 사용합니다.

### `POST /api/verifications`

현장 검증 요청을 만들고 담당자, 발행 시각, 완료 기한이 포함된 작업 지시를 반환합니다. 공개 데모의 런타임 보호를 위해 요청 본문은 16KiB, 안전 확인 항목은 최대 10개, 인스턴스별 최근 기록은 100건으로 제한합니다.

```json
{
  "incidentId": "INC-20260829-042",
  "requestedBy": "라인 엔지니어 김현수",
  "assignee": "설비 보전팀 이민호",
  "checks": ["안전 조건 확인"]
}
```

```json
{
  "id": "WO-12AB34CD",
  "incidentId": "INC-20260829-042",
  "requestedBy": "라인 엔지니어 김현수",
  "assignee": "설비 보전팀 이민호",
  "checks": ["안전 조건 확인"],
  "status": "issued",
  "issuedAt": 1788022800000,
  "dueAt": 1788024600000
}
```

## WebSocket `/stream`

- `hello`: 스트림 ID, 전송 간격, 서버 시간
- `sensor.point`: 센서 시점과 증가하는 시퀀스 번호
- `heartbeat`: 연결 생존 확인용 서버 시간

센서 시점은 `webTensionLeft`, `webTensionRight`, `ovenTemperature`, `lineSpeed`, `defectRate`를 같은 타임스탬프로 묶습니다. 공유 계약은 `packages/contracts/src/index.ts`에 있습니다.
