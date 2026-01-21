import type { APIRoute } from 'astro';
import { Resend } from 'resend';

const resend = new Resend(import.meta.env.RESEND_API_KEY);

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const { formType, name, email, data } = body;

    let subject = '';
    let htmlContent = '';

    if (formType === 'maintainers') {
      const { github, repo, hours, willingness, concerns } = data;
      subject = 'OSS Rewards - Maintainer Application';
      htmlContent = `
        <h2>New Maintainer Signup</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>GitHub Username:</strong> ${github}</p>
        <p><strong>Repository:</strong> ${repo}</p>
        <p><strong>Hours/week reviewing PRs:</strong> ${hours || 'Not specified'}</p>
        <p><strong>How much would you pay to skip spam:</strong> ${willingness || 'Not specified'}</p>
        <p><strong>Concerns:</strong> ${concerns || 'None'}</p>
      `;
    } else if (formType === 'contributors') {
      const { github, prs, bounties, motivation } = data;
      subject = 'OSS Rewards - Contributor Application';
      htmlContent = `
        <h2>New Contributor Signup</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>GitHub Username:</strong> ${github}</p>
        <p><strong>PRs made in OSS last year:</strong> ${prs || 'Not specified'}</p>
        <p><strong>Used bounty platforms before:</strong> ${bounties || 'Not specified'}</p>
        <p><strong>What motivates you:</strong> ${motivation || 'Not specified'}</p>
      `;
    } else if (formType === 'enterprises') {
      const { company, deps, budget } = data;
      subject = 'OSS Rewards - Enterprise Application';
      htmlContent = `
        <h2>New Enterprise Signup</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>Critical OSS dependencies:</strong> ${deps || 'Not specified'}</p>
        <p><strong>Annual OSS maintenance budget:</strong> ${budget || 'Not specified'}</p>
      `;
    }

    // Send email to your inbox
    await resend.emails.send({
      from: 'noreply@ossrewards.com',
      to: 'frederickandradeperez@gmail.com',
      subject: subject,
      html: htmlContent,
    });

    // Send confirmation email to user
    await resend.emails.send({
      from: 'noreply@ossrewards.com',
      to: email,
      subject: '✅ You\'re in! OSS Rewards Early Access',
      html: `
        <h2>Welcome to OSS Rewards!</h2>
        <p>Thanks for signing up for early access. We'll be in touch soon.</p>
        <p>In the meantime, follow us on GitHub: <a href="https://github.com/ossrewards">github.com/ossrewards</a></p>
      `,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Email send error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to send email' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
