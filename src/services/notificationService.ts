export const notificationService = {
  sendRegistrationConfirmation: async (email: string, name?: string) => {
    try {
      const response = await fetch('/api/send-welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      const data = await response.json();
      console.log('Welcome email response:', response.status, data);
      if (!response.ok) {
        console.error('Failed to send welcome email (server error):', data instanceof Error ? data.message : String(data));
      }
    } catch (error) {
      console.error('Failed to send welcome email (network error):', error instanceof Error ? error.message : String(error));
    }
  },
  
  sendPaymentConfirmation: async (email: string, name?: string) => {
    // Payment confirmation is handled by the server webhook now,
    // but we can keep this for manual triggers if needed.
    console.log(`[EMAIL] To: ${email} - Confirmation de paiement de 79€ reçu.`);
  }
};
