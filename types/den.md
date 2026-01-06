---
typeId: den
fields:
  fieldDefs:
    name:
      required: true
    level:
      required: true
      options:
        - Lion
        - Tiger
        - Wolf
        - Bear
        - Webelos
        - AOL
    meeting:
      required: false
    notes:
      required: false
  composition:
    denLeaders:
      typeId: adult
      required: true
    scouts:
      typeId: scout
      required: true
  ui:
    icon: "🐾"
---
