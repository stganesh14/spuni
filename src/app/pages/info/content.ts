export interface InfoSection {
  heading: string;
  body: string[];
}

export interface InfoPageContent {
  eyebrow: string;
  title: string;
  lead: string;
  image?: string;
  sections: InfoSection[];
  faq?: { q: string; a: string }[];
}

/** Static store policies. Review with your legal and operations team before launch. */
export const INFO_PAGES: Record<string, InfoPageContent> = {
  about: {
    eyebrow: 'Our story',
    title: 'Made slowly. Carried forever.',
    lead: 'SPUNI is a small Chennai atelier making vegan leather goods the old way: cut by hand, stitched by hand, finished by hand.',
    image: '/assets/craftsmanship.jpeg',
    sections: [
      {
        heading: 'Why vegan leather',
        body: [
          'We believe no animal should pay the price for beauty. Our premium vegan leather is chosen for how it feels, how it ages and how long it lasts.',
          'Every hide is inspected by hand before a single pattern is cut.',
        ],
      },
      {
        heading: 'How a SPUNI piece is made',
        body: [
          'Patterns are drawn and cut in our Periamet workshop. Seams are stitched with waxed thread at eight stitches per inch, edges are painted in layers and burnished until smooth.',
          'A bag takes between one and three days to make. A wallet, a few hours. None of it is rushed.',
        ],
      },
      {
        heading: 'Made to be personal',
        body: [
          'Many of our pieces can be monogrammed or customised. Our artisans also take on fully bespoke commissions, from wedding gifts to corporate collections.',
        ],
      },
    ],
  },
  shipping: {
    eyebrow: 'Help',
    title: 'Shipping',
    lead: 'We ship across India with trusted courier partners and email you tracking the moment your parcel leaves the atelier.',
    sections: [
      {
        heading: 'Dispatch times',
        body: [
          'Ready-made pieces are dispatched within 1 to 2 working days. Customised pieces take 2 to 3 weeks; we will confirm the timeline with your quote.',
        ],
      },
      {
        heading: 'Delivery',
        body: [
          'Most metro cities receive orders in 3 to 5 days after dispatch, and the rest of India in 5 to 7 days.',
          'Shipping is free above the threshold shown in your bag; below it, a flat fee applies and is shown before you pay.',
        ],
      },
      {
        heading: 'Tracking',
        body: ['You will receive an email with the courier name and tracking number when your order ships. You can also follow it from My account › Orders.'],
      },
    ],
  },
  returns: {
    eyebrow: 'Help',
    title: 'Returns & refunds',
    lead: 'If a piece is not right, tell us within 7 days of delivery and we will make it right.',
    sections: [
      {
        heading: 'Eligibility',
        body: [
          'Unused items in their original packaging can be returned within 7 days of delivery.',
          'Personalised, monogrammed and bespoke pieces cannot be returned unless they arrive damaged or faulty.',
        ],
      },
      {
        heading: 'Cancellations',
        body: [
          'You can cancel an order from My account until it ships. Card and UPI payments are refunded to the original method, and any SPUNI Wallet points you used are returned to your wallet instantly.',
        ],
      },
      {
        heading: 'Refund timing',
        body: ['Refunds are issued within 48 hours of approval. Banks usually take 5 to 7 working days to show the credit.'],
      },
      {
        heading: 'How to start a return',
        body: ['Write to us from the Contact page with your order number and a photo of the item. We will arrange a pickup where available.'],
      },
    ],
  },
  faq: {
    eyebrow: 'Help',
    title: 'Frequently asked questions',
    lead: 'Quick answers to the things people ask us most.',
    sections: [],
    faq: [
      { q: 'Do I need an account to shop?', a: 'No. Browse and fill your bag freely. We only ask you to sign in with your email, using a one-time code, when you check out.' },
      { q: 'What is the SPUNI Wallet?', a: 'Every order earns a percentage back as wallet points. You can use them for part of your next order. Gift cards are redeemed into the wallet too.' },
      { q: 'I did not receive my login code.', a: 'Check your spam or promotions folder, then use "Send a new code" on the sign-in page. Each new code replaces the previous one.' },
      { q: 'Is the leather real?', a: 'All SPUNI pieces use premium vegan leather. No animal skin is used in any of our products.' },
      { q: 'Can I personalise my order?', a: 'Yes. Pieces marked Customisable can be monogrammed, and you can request fully bespoke designs from the Customise page.' },
      { q: 'How do e-gift cards work?', a: 'Choose an amount, add the recipient and a message, and pay. They receive a secure code by email to redeem into their SPUNI Wallet.' },
      { q: 'Which payment methods do you accept?', a: 'UPI, all major credit and debit cards and net banking, processed securely by Razorpay.' },
      { q: 'How do I care for vegan leather?', a: 'Wipe with a soft dry cloth, keep away from prolonged sunlight and moisture, and store stuffed lightly in the dust bag.' },
    ],
  },
  privacy: {
    eyebrow: 'Legal',
    title: 'Privacy policy',
    lead: 'We collect only what we need to run your orders and never sell your data.',
    sections: [
      { heading: 'What we collect', body: ['Your email address, name, phone number and delivery addresses; your orders and wallet activity; and any files you upload for customisation requests.'] },
      { heading: 'How we use it', body: ['To sign you in, process and deliver orders, send order and shipping emails, answer your requests and, only if you opt in, tell you about new drops.'] },
      { heading: 'Payments', body: ['Card and UPI details are entered with Razorpay and never reach or are stored by SPUNI.'] },
      { heading: 'Cookies', body: ['We use one essential, secure cookie to keep you signed in. Your bag and wishlist are kept in your browser.'] },
      { heading: 'Your choices', body: ['You can update your details in My account, unsubscribe from launch emails from any email footer, or write to us to delete your account.'] },
    ],
  },
  terms: {
    eyebrow: 'Legal',
    title: 'Terms of use',
    lead: 'The short version: be kind, use the site honestly, and we will do the same.',
    sections: [
      { heading: 'Orders', body: ['An order is confirmed once payment is verified. Prices are in Indian rupees and include applicable taxes. We may cancel and fully refund orders affected by pricing errors or stock problems.'] },
      { heading: 'SPUNI Wallet', body: ['Wallet points have no cash value, cannot be transferred, and can be used for up to the percentage of an order shown at checkout. Points earned on an order are reversed if it is cancelled or refunded.'] },
      { heading: 'Gift cards', body: ['E-gift cards are valid for the period shown at purchase, can be redeemed once, and cannot be exchanged for cash.'] },
      { heading: 'Customisation', body: ['Bespoke work begins once you approve the design and quote. Personalised pieces are made for you and are not returnable unless faulty.'] },
      { heading: 'Contact', body: ['Questions about these terms can be sent from the Contact page.'] },
    ],
  },
};
