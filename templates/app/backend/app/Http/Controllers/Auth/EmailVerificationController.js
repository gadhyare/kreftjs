const { Hash, Url, abort, same } = require('kreft/server')
const User = require('../../../Models/User')

class EmailVerificationController {
  // POST /api/email/verification-notification: send the link again (pages/auth/VerifyEmail.kreft)
  async send(req) {
    if (req.user.hasVerifiedEmail()) return { message: 'Your email address is already verified.' }
    await req.user.sendEmailVerificationNotification()
    return { message: 'A new verification link has been sent to your email address.' }
  }

  // POST /api/email/verify  { id, hash, expires, signature }: the link from the email was opened
  async verify(req) {
    const { id, hash, expires, signature } = req.all()
    if (!Url.check(`/verify-email/${id}/${hash}`, { expires, signature })) abort(403, 'This link is not valid any more. Ask for a new one.')
    const user = await User.findOrFail(id)
    if (!same(String(hash || ''), Hash.sha256(user.email))) abort(403, 'This link is not valid any more. Ask for a new one.')
    if (!user.hasVerifiedEmail()) await user.markEmailAsVerified()
    return { message: 'Your email address is verified.', user: { id: user.id, email_verified_at: user.email_verified_at } }
  }
}

module.exports = EmailVerificationController
