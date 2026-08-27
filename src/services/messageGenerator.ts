export type MessageTone = 'Natural' | 'Friendly' | 'Professional' | 'Short & Direct';

export interface GeneratorContext {
  customerName: string;
  businessName?: string;
  topic: string;
  tone?: MessageTone;
  quotationNumber?: string;
  invoiceNumber?: string;
  assignedTo?: string;
  variationIndex?: number;
}

export function generateHumanFollowUpMessage(ctx: GeneratorContext): string {
  const firstName = getFirstName(ctx.customerName);
  const company = ctx.businessName || 'our team';
  const tone = ctx.tone || 'Natural';
  const varIdx = (ctx.variationIndex || 0) % 3;

  const topicLower = (ctx.topic || '').toLowerCase();

  // 1. QUOTATION FOLLOW-UP
  if (topicLower.includes('quotation') || topicLower.includes('quote')) {
    const qNo = ctx.quotationNumber ? ` ${ctx.quotationNumber}` : '';
    if (tone === 'Short & Direct') {
      const vars = [
        `Hi ${firstName}, just checking in on quotation${qNo} we shared. Let me know if you have any questions or need any adjustments.`,
        `Hi ${firstName}, following up on quote${qNo}. Have you had a chance to review it? Happy to clarify anything.`,
        `Hi ${firstName}, just wanted to check if you're ready to proceed with quotation${qNo}? Let me know!`,
      ];
      return vars[varIdx];
    }
    if (tone === 'Friendly') {
      const vars = [
        `Hi ${firstName}! Hope you're having a good week. Just following up on the quotation${qNo} we sent over. Take your time to review it, and feel free to reach out if you'd like to discuss the details.`,
        `Hey ${firstName}, hope all is well! Just checking in to see if you had a chance to go through quotation${qNo}. Let me know if you need any changes or extra info.`,
        `Hi ${firstName}! Hope things are going great. Wanted to check in regarding quotation${qNo}. Let us know if you'd like to make any quick updates!`,
      ];
      return vars[varIdx];
    }
    if (tone === 'Professional') {
      const vars = [
        `Hello ${firstName}, I am following up regarding quotation${qNo} shared with you earlier. Please let us know if you have reviewed the proposal or if you require any modifications.`,
        `Hello ${firstName}, just checking on the status of quotation${qNo}. Kindly let us know if you have any questions or if we can assist with the next steps.`,
        `Hello ${firstName}, following up on quotation${qNo} sent by ${company}. We look forward to your feedback.`,
      ];
      return vars[varIdx];
    }
    // Default: Natural
    const vars = [
      `Hi ${firstName}, just following up regarding the quotation${qNo} we shared. Please let me know if you've had a chance to review it or if you'd like me to clarify anything.`,
      `Hi ${firstName}, checking in on quotation${qNo}. Let me know if you've gone through the details or if you'd like to make any adjustments before we proceed.`,
      `Hi ${firstName}, wanted to check if you had any questions regarding quotation${qNo}? Happy to connect whenever it's convenient for you.`,
    ];
    return vars[varIdx];
  }

  // 2. INVOICE / PAYMENT REMINDER
  if (topicLower.includes('payment') || topicLower.includes('invoice')) {
    const invNo = ctx.invoiceNumber ? ` ${ctx.invoiceNumber}` : '';
    if (tone === 'Short & Direct') {
      const vars = [
        `Hi ${firstName}, friendly reminder regarding payment for invoice${invNo}. Please let us know once processed.`,
        `Hi ${firstName}, just checking on invoice${invNo}. Let us know if you need the account details re-sent.`,
        `Hi ${firstName}, reminder regarding outstanding invoice${invNo}. Let me know if you need any assistance with payment.`,
      ];
      return vars[varIdx];
    }
    if (tone === 'Friendly') {
      const vars = [
        `Hi ${firstName}, hope you're having a good day! Just a gentle reminder regarding invoice${invNo}. Please let us know if you have any questions about the billing.`,
        `Hey ${firstName}! Hope all is well. Reaching out with a quick check on invoice${invNo}. Let me know if you need another copy of the invoice or UPI details.`,
        `Hi ${firstName}! Just checking in regarding payment for invoice${invNo}. Feel free to drop a message once completed. Thanks!`,
      ];
      return vars[varIdx];
    }
    if (tone === 'Professional') {
      const vars = [
        `Hello ${firstName}, this is a gentle reminder regarding payment for invoice${invNo}. Kindly let us know the status of the transaction.`,
        `Hello ${firstName}, following up regarding outstanding invoice${invNo}. Please reply or send the payment confirmation receipt at your earliest convenience.`,
        `Hello ${firstName}, kindly checking on invoice${invNo}. Please let us know if you require any payment details from our end.`,
      ];
      return vars[varIdx];
    }
    // Default: Natural
    const vars = [
      `Hi ${firstName}, just a quick check regarding invoice${invNo}. Please let us know if payment has been initiated or if you need us to re-send the invoice copy.`,
      `Hi ${firstName}, following up on invoice${invNo}. Let me know if everything is clear on the billing or if you need any quick help with payment.`,
      `Hi ${firstName}, hope you're doing well. Just wanted to check on the status of invoice${invNo}. Thanks!`,
    ];
    return vars[varIdx];
  }

  // 3. DEMO REMINDER / MEETING FOLLOW-UP
  if (topicLower.includes('demo') || topicLower.includes('meeting')) {
    if (tone === 'Short & Direct') {
      const vars = [
        `Hi ${firstName}, confirming our scheduled session for today. Let me know if the time still works for you.`,
        `Hi ${firstName}, checking in regarding our planned discussion. Looking forward to connecting shortly.`,
        `Hi ${firstName}, just confirming our meeting time. Let me know if you need to adjust the schedule.`,
      ];
      return vars[varIdx];
    }
    const vars = [
      `Hi ${firstName}, just checking in regarding our scheduled product session. Let me know if the time still works well for you or if we should adjust.`,
      `Hi ${firstName}, looking forward to our discussion! Please let me know if you have any specific topics you'd like us to cover during our session.`,
      `Hi ${firstName}, hope you're having a great day! Reaching out to confirm our upcoming discussion. Let me know if you're ready to connect.`,
    ];
    return vars[varIdx];
  }

  // 4. ORDER CONFIRMATION / CHECK-IN / GENERAL
  if (tone === 'Short & Direct') {
    const vars = [
      `Hi ${firstName}, checking in regarding ${ctx.topic || 'your order'}. Let me know if you need any updates.`,
      `Hi ${firstName}, quick follow-up on ${ctx.topic || 'our discussion'}. Let me know if you have any questions!`,
      `Hi ${firstName}, following up on ${ctx.topic || 'your inquiry'}. Ready whenever you are.`,
    ];
    return vars[varIdx];
  }

  if (tone === 'Friendly') {
    const vars = [
      `Hi ${firstName}! Hope you're having a great day. Just following up regarding ${ctx.topic || 'our recent conversation'}. Let me know if there's anything I can help with!`,
      `Hey ${firstName}, hope all is well! Reaching out to check in on ${ctx.topic || 'your inquiry'}. Feel free to drop a message whenever you're free.`,
      `Hi ${firstName}! Just checking in regarding ${ctx.topic || 'your requirements'}. Let us know if you need any quick details!`,
    ];
    return vars[varIdx];
  }

  if (tone === 'Professional') {
    const vars = [
      `Hello ${firstName}, I am following up regarding ${ctx.topic || 'our previous communication'}. Please let us know if you require any further information.`,
      `Hello ${firstName}, kindly checking on ${ctx.topic || 'your request'}. We look forward to assisting you.`,
      `Hello ${firstName}, reaching out to confirm status on ${ctx.topic || 'our discussion'}. Please share your update at your convenience.`,
    ];
    return vars[varIdx];
  }

  // Default Natural
  const vars = [
    `Hi ${firstName}, just checking in regarding ${ctx.topic || 'our previous discussion'}. Let me know if you've had a chance to review or if you have any questions.`,
    `Hi ${firstName}, following up on ${ctx.topic || 'your inquiry'}. Happy to help if you need any additional details or assistance.`,
    `Hi ${firstName}, wanted to check if you had any updates on ${ctx.topic || 'our conversation'}? Let me know whenever it's convenient for you to connect.`,
  ];
  return vars[varIdx];
}

function getFirstName(fullName: string): string {
  if (!fullName) return 'there';
  const clean = fullName.trim().replace(/^(Mr|Mrs|Ms|Dr|Er)\.?\s+/i, '');
  const parts = clean.split(/\s+/);
  return parts[0] || 'there';
}
