const nodemailer = require('nodemailer')
const config = require('./keys')

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
})

const sendEmail = async (emailData) => {
  try {
    const mailOptions = {
      from: config.email.user,
      to: config.email.user,
      subject: `Contact Form: ${emailData.subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${emailData.name}</p>
        <p><strong>Email:</strong> ${emailData.email}</p>
        <p><strong>Subject:</strong> ${emailData.subject}</p>
        <p><strong>Message:</strong></p>
        <p>${emailData.message}</p>
        <hr>
        <p><em>Sent from Nuke Brand website contact form</em></p>
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Email sending error:', error)
    return { success: false, error: error.message }
  }
}

module.exports = { sendEmail } 