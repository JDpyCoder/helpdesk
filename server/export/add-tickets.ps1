# Adds sample tickets to the HelpDesk app through the inbound-email webhook.
# Run:  powershell -ExecutionPolicy Bypass -File .\add-tickets.ps1

$appUrl = (Read-Host "App URL (jaise https://helpdesk-xxxx.onrender.com)").Trim().TrimEnd('/')
$secure = Read-Host "INBOUND_EMAIL_SECRET" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$tickets = @(
    @{
        name    = "Rahul Sharma"
        email   = "rahul.sharma@example.com"
        subject = "Unable to log in to my account"
        text    = "Hi, I have been trying to log in since this morning but it keeps saying invalid password. I already tried resetting it twice. Please help."
    },
    @{
        name    = "Priya Patel"
        email   = "priya.patel@example.com"
        subject = "Charged twice for my subscription"
        text    = "Hello, my card was charged two times this month for the same plan. Can you please refund the extra charge?"
    },
    @{
        name    = "Amit Verma"
        email   = "amit.verma@example.com"
        subject = "How do I change my email address?"
        text    = "I want to update the email address on my account to my new work email. Where can I do that?"
    },
    @{
        name    = "Sneha Iyer"
        email   = "sneha.iyer@example.com"
        subject = "App crashes when uploading a file"
        text    = "Whenever I try to upload a PDF larger than 5 MB the page freezes and then shows an error. I am using Chrome on Windows 11."
    },
    @{
        name    = "Karan Mehta"
        email   = "karan.mehta@example.com"
        subject = "Request for invoice copy"
        text    = "Could you send me the invoice for my last payment? I need it for my company's reimbursement."
    },
    @{
        name    = "Neha Gupta"
        email   = "neha.gupta@example.com"
        subject = "Feature request: dark mode on mobile"
        text    = "Love the product! It would be great if the mobile site also supported dark mode."
    },
    @{
        name    = "Vikram Singh"
        email   = "vikram.singh@example.com"
        subject = "Cancel my subscription"
        text    = "Please cancel my subscription from next month. I no longer need the service."
    },
    @{
        name    = "Ananya Rao"
        email   = "ananya.rao@example.com"
        subject = "Password reset email not received"
        text    = "I requested a password reset link three times but nothing arrived, not even in spam. Can you check?"
    },
    @{
        name    = "Rohit Kulkarni"
        email   = "rohit.k@example.com"
        subject = "Slow loading dashboard"
        text    = "The dashboard has been taking almost 20 seconds to load for the last two days. Is there an issue on your side?"
    },
    @{
        name    = "Pooja Desai"
        email   = "pooja.desai@example.com"
        subject = "Refund status"
        text    = "I was told my refund was processed last week but I still don't see it in my bank account. What is the status?"
    },
    @{
        name    = "Arjun Nair"
        email   = "arjun.nair@example.com"
        subject = "Do you offer student discounts?"
        text    = "I'm a college student and wanted to know if you have any discount plans for students."
    },
    @{
        name    = "Meera Joshi"
        email   = "meera.joshi@example.com"
        subject = "Two-factor authentication not working"
        text    = "The 6-digit code from my authenticator app is always rejected. My phone time is set to automatic."
    }
)

$runId = Get-Date -Format yyyyMMddHHmmss
$i = 0
foreach ($t in $tickets) {
    $i++
    $body = @{
        from      = @{ email = $t.email; name = $t.name }
        subject   = $t.subject
        text      = $t.text
        messageId = "<seed-$runId-$i@example.com>"
    } | ConvertTo-Json -Depth 3

    try {
        $r = Invoke-RestMethod -Method Post -Uri "$appUrl/api/inbound-email" `
            -Headers @{ Authorization = "Bearer $secret" } `
            -ContentType "application/json" -Body $body -TimeoutSec 90
        Write-Output "OK    #$($r.ticketId)  $($t.subject)"
    } catch {
        Write-Output "FAIL  $($t.subject)  ->  $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 5
}

$secret = $null
Write-Output "Done."
