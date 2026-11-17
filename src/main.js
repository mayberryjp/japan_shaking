import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { VApp, VBtn, VBtnToggle, VCard, VCardActions, VCardText, VCardTitle, VDialog, VProgressCircular, VSpacer } from 'vuetify/components'
import 'vuetify/styles'
import App from './App.vue'
import './style.css'

createApp(App).use(createVuetify({
  components: { VApp, VBtn, VBtnToggle, VCard, VCardActions, VCardText, VCardTitle, VDialog, VProgressCircular, VSpacer },
  theme: {
    defaultTheme: 'atlas',
    themes: { atlas: { dark: false, colors: { primary: '#c84332', background: '#f5f3ed', surface: '#fcfbf7' } } },
  },
  defaults: { VBtn: { rounded: 'lg', elevation: 0 }, VDialog: { maxWidth: 620 } },
})).mount('#app')
