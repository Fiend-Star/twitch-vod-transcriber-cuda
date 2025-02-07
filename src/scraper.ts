async function fetchVideoIDs(channelName: string): Promise<string[]> {
    const gqlResponse = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `
          query {
            user(login: "${channelName}") {
              videos {
                edges {
                  node {
                    id
                  }
                }
              }
            }
          }
        `
      })
    });
   
    const data = await gqlResponse.json();
    return data?.data?.user?.videos?.edges?.map((edge: any) => edge.node.id) || [];
   }
   
   export { fetchVideoIDs };