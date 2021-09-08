import { reactive, readonly } from 'vue'
import browser from 'webextension-polyfill'

import { WebsiteData } from '../../types/communication'
import { Cookie } from '../../types/cookie'
import {
    StoreWebsite,
    StoreWebsiteMethods,
    StoreWebsiteScore,
    StoreWebsiteStates,
} from '../types/store/website'

const websiteStates: StoreWebsiteStates = reactive({
    internal: false,
    loading: false,
})

const websiteMethods: StoreWebsiteMethods = {
    async clear(): Promise<void> {
        websiteStates.data = {} as WebsiteData

        const tab = await browser.tabs.query({
            active: true,
            currentWindow: true,
        })
        if (!tab) return
        const id = tab[0].id
        const url = tab[0].url
        if (!id || !url) return
        const { protocol, origin } = new URL(url)
        if (!origin) return

        await browser.cookies.remove({
            url: `${origin}/trest`,
            name: `${protocol}trest`,
        })
    },
}

const website: StoreWebsite = {
    states: readonly(websiteStates),
    methods: websiteMethods,
}

export default website

async function fetchData() {
    const tab = await browser.tabs.query({
        active: true,
        currentWindow: true,
    })
    if (!tab) return

    while (tab[0].status === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const id = tab[0].id
    const url = tab[0].url
    if (!id || !url) return
    const { protocol, origin } = new URL(url)
    if (!protocol || !origin) return

    if (!['http:', 'https:'].includes(protocol)) {
        websiteStates.internal = true
        websiteStates.loading = false
        return
    }

    let cookie = await browser.cookies.get({
        url: `${origin}/trest`,
        name: `${protocol}trest`,
    })

    let cookieData: Cookie | undefined

    if (cookie) {
        cookieData = JSON.parse(cookie.value)
    }

    const extensionVersion = await browser.runtime.getManifest().version

    if (!cookieData || cookieData.version !== extensionVersion) {
        websiteStates.loading = true
        try {
            await browser.tabs.sendMessage(id, {})
        } catch (e) {
            console.error(e)
            await browser.tabs.reload(id)
            await fetchData()
            return
        }
        cookie = await browser.cookies.get({
            url: `${origin}/trest`,
            name: `${protocol}trest`,
        })
    }

    if (cookie) {
        websiteStates.data = JSON.parse(cookie.value)
        websiteStates.loading = false
    }
}

function calculateScore() {
    const data = websiteStates.data
    if (!data) return

    websiteStates.score = {
        domain: {
            registration: 'neutral',
            lastChanged: 'neutral',
            registrant: 'neutral',
        },
    }
    const score = websiteStates.score

    if (data.dns?.events.registration) {
        const registration = new Date(data.dns?.events.registration)
        const recent = new Date()
        recent.setFullYear(recent.getFullYear() - 1)

        if (recent < registration) {
            score.domain.registration = 'warning'
        } else {
            score.domain.registration = 'ok'
        }
    }

    if (data.dns?.events.lastChanged) {
        const lastChanged = new Date(data.dns?.events.lastChanged)
        const recent = new Date()
        recent.setMonth(recent.getMonth() - 6)

        if (recent < lastChanged) {
            score.domain.lastChanged = 'warning'
        } else {
            score.domain.lastChanged = 'ok'
        }
    }

    if (data.dns?.registrant) {
        score.domain.registrant = 'ok'
    } else {
        score.domain.registrant = 'warning'
    }
}

;(async () => {
    await fetchData()
    calculateScore()
})()
