import dns from 'dns';
dns.lookup('smtp.hostinger.com', { family: 4 }, (err, address) => {
  console.log('IPv4:', address);
});
