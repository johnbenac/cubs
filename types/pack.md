---
typeId: pack
fields:
  fieldDefs:
    name:
      required: true
      label: "Pack name"
    packNumber:
      required: true
      widget: "text"
    charterOrg:
      required: false
    meetingInfo:
      required: false
      ui:
        widget: "object"
    contactEmail:
      required: false
    notes:
      required: false
  composition:
    committee:
      typeId: committee
      required: true
    dens:
      typeId: den
      required: true
    keyLeaders:
      typeId: adult
      required: true
    events:
      typeId: event
      required: false
  ui:
    icon: "🎒"
    color: "blue"
---
