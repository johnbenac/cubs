---
typeId: committee
fields:
  fieldDefs:
    name:
      required: true
      label: "Committee name"
    programYear:
      required: true
      helpText: "e.g. 2025–2026"
    meetingSchedule:
      required: false
    notes:
      required: false
  composition:
    members:
      typeId: adult
      required: true
  ui:
    icon: "🧩"
---
