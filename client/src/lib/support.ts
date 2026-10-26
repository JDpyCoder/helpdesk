// The support inbox customers write to; mail sent there becomes a ticket (AgentMail, see agentmail-setup.md).
// Set VITE_SUPPORT_EMAIL in client/.env (or as a build variable in production) to change it everywhere.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'jaydeep.helpdesk@agentmail.to'

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`
export const SUPPORT_REQUEST_MAILTO = `${SUPPORT_MAILTO}?subject=${encodeURIComponent('Support Request')}`

// Set once the banner is closed, so it stays hidden on later visits in this browser
export const SUPPORT_BANNER_STORAGE_KEY = 'helpdesk-support-banner-dismissed'
