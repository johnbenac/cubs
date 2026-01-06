---
typeId: event
fields:
  fieldDefs:
    title:
      required: true
    date:
      required: true
      widget: "date"
    location:
      required: false
    startTime:
      required: false
    endTime:
      required: false
    notes:
      required: false
  composition:
    hostPack:
      typeId: pack
      required: true
  ui:
    icon: "📅"
---
