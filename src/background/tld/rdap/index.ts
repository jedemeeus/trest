import axios from 'axios'

import { Dns } from '../../../types/dns'
import { RDAPData } from '../../types/rdap'

import { Website } from '..'
import {
    getRdapDnssec,
    getRdapEvents,
    getRdapLinks,
    getRdapRegistrant,
    getRdapUrls,
} from '../../rdap'

export default class Website_rdap extends Website {
    constructor(hostname: string) {
        super(hostname)
    }

    public async dns(): Promise<Dns | undefined> {
        let data: Dns = {} as Dns

        const urls = await getRdapUrls(this.tld)
        if (!urls) return

        const rdapUrls: string[] = []
        for (const u of urls) {
            rdapUrls.push(u)
        }

        while (rdapUrls.length !== 0) {
            const url = rdapUrls[0]
            rdapUrls.shift()

            try {
                const { status, data: rdapData } = await axios.get<RDAPData>(
                    `${url}${url.endsWith('/') ? '' : '/'}domain/${this.domain}`
                )
                if (status !== 200) continue

                const parsedData: Dns = {} as Dns

                const links = await getRdapLinks(rdapData)
                for (const link of links) {
                    rdapUrls.push(link)
                }

                const events = await getRdapEvents(rdapData)
                if (events) {
                    parsedData.events = events
                }

                const registrant = await getRdapRegistrant(rdapData)
                if (registrant) {
                    parsedData.registrant = registrant
                }

                const dnssec = await getRdapDnssec(rdapData)
                parsedData.dnssec = dnssec

                data = { ...parsedData, ...data }
            } catch (e) {
                continue
            }
        }

        return data
    }
}
